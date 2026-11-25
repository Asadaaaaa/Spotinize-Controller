import crypto from 'crypto';
import { sequelize } from '../config/database.js';
import { User, CosmeticItem, UserItem, GachaLog, NotesTransaction } from '../models/index.js';
import { cosmeticService } from './CosmeticService.js';

export const GACHA_RATES = {
  COMMON: 50,
  RARE: 30,
  EPIC: 14,
  LEGENDARY: 5,
  MYTHIC: 1
};

export const GACHA_PRICES = {
  1: 200,
  5: 900,
  10: 1750
};

export const CRATE_DEFINITIONS = [
  {
    id: 'crate_groove',
    name: 'Groove Crate',
    description: 'Peti klasik dengan koleksi vinyl dan bingkai dasar.',
    descriptionEn: 'Classic crate featuring vinyls and starter stage frames.',
    prices: { 1: 150, 5: 675, 10: 1300 },
    rates: { COMMON: 55, RARE: 30, EPIC: 11, LEGENDARY: 3.5, MYTHIC: 0.5 },
    featuredCodes: [
      'gacha_vinyl_mythic_prism',
      'gacha_vinyl_obsidian_gold',
      'gacha_frame_amethyst_eq',
      'gacha_vinyl_magenta'
    ]
  },
  {
    id: 'crate_synth',
    name: 'Synth Crate',
    description: 'Peti bertema synth dengan peluang Epic lebih tinggi.',
    descriptionEn: 'Synth-themed crate with boosted Epic drop rates.',
    prices: { 1: 250, 5: 1125, 10: 2150 },
    rates: { COMMON: 42, RARE: 32, EPIC: 18, LEGENDARY: 6.5, MYTHIC: 1.5 },
    featuredCodes: [
      'gacha_frame_mythic_crimson',
      'gacha_frame_solar_flare',
      'gacha_vinyl_magenta',
      'gacha_title_sonic_phantom'
    ]
  },
  {
    id: 'crate_maestro',
    name: 'Maestro Vault',
    description: 'Brankas premium dengan peluang tertinggi Legendary & Mythic.',
    descriptionEn: 'Premium vault with the highest Legendary & Mythic odds.',
    prices: { 1: 400, 5: 1800, 10: 3400 },
    rates: { COMMON: 25, RARE: 35, EPIC: 25, LEGENDARY: 12, MYTHIC: 3 },
    featuredCodes: [
      'gacha_title_mythic_oracle',
      'gacha_title_golden_ear',
      'gacha_frame_amethyst_eq',
      'gacha_title_sonic_phantom'
    ]
  }
];

export const DUPLICATE_REFUND_NOTES = {
  COMMON: 25,
  RARE: 60,
  EPIC: 140,
  LEGENDARY: 320,
  MYTHIC: 600
};

class GachaService {
  _getCrateDef(crateId) {
    return CRATE_DEFINITIONS.find(c => c.id === crateId) || CRATE_DEFINITIONS[0];
  }

  _rollRarity(pityEpic, pityLegendary, rates = GACHA_RATES) {
    // Hard Pity 50 -> Guaranteed LEGENDARY or MYTHIC
    if (pityLegendary >= 49) {
      const mythicRoll = Math.random() * 6;
      return {
        rarity: mythicRoll < 1 ? 'MYTHIC' : 'LEGENDARY',
        pityTriggered: 'PITY_50_LEGENDARY'
      };
    }

    // Soft/Hard Pity 10 -> Guaranteed EPIC or higher
    if (pityEpic >= 9) {
      const epicSum = (rates.EPIC || 14) + (rates.LEGENDARY || 5) + (rates.MYTHIC || 1);
      const r = Math.random() * epicSum;
      let rarity = 'EPIC';
      if (r < (rates.MYTHIC || 1)) rarity = 'MYTHIC';
      else if (r < (rates.MYTHIC || 1) + (rates.LEGENDARY || 5)) rarity = 'LEGENDARY';
      return {
        rarity,
        pityTriggered: 'PITY_10_EPIC'
      };
    }

    const roll = Math.random() * 100;
    if (roll < rates.MYTHIC) return { rarity: 'MYTHIC', pityTriggered: null };
    if (roll < rates.MYTHIC + rates.LEGENDARY) return { rarity: 'LEGENDARY', pityTriggered: null };
    if (roll < rates.MYTHIC + rates.LEGENDARY + rates.EPIC) return { rarity: 'EPIC', pityTriggered: null };
    if (roll < rates.MYTHIC + rates.LEGENDARY + rates.EPIC + rates.RARE) return { rarity: 'RARE', pityTriggered: null };
    return { rarity: 'COMMON', pityTriggered: null };
  }

  _pickFromPool(poolByRarity, targetRarity) {
    const order = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'COMMON'];
    const direct = poolByRarity.get(targetRarity);
    if (direct && direct.length > 0) {
      return direct[Math.floor(Math.random() * direct.length)];
    }
    const idx = order.indexOf(targetRarity);
    for (let i = idx + 1; i < order.length; i++) {
      const fallback = poolByRarity.get(order[i]);
      if (fallback && fallback.length > 0) {
        return fallback[Math.floor(Math.random() * fallback.length)];
      }
    }
    for (const key of order) {
      const any = poolByRarity.get(key);
      if (any && any.length > 0) return any[Math.floor(Math.random() * any.length)];
    }
    return null;
  }

  async getGachaInfo(userId = null) {
    const pool = await CosmeticItem.findAll({
      where: {
        source: 'gacha',
        isGachaAvailable: true,
        isActive: true
      },
      order: [['rarity', 'DESC'], ['name', 'ASC']]
    });

    const enrichedPool = await cosmeticService.attachScarcityStats(pool);
    let userState = {
      notesBalance: 0,
      gachaTickets: 0,
      pityEpic: 0,
      pityLegendary: 0
    };
    let recentLogs = [];

    if (userId) {
      const [user, logs, ownedRows] = await Promise.all([
        User.findByPk(userId, {
          attributes: ['notesBalance', 'gachaTickets', 'gachaPityEpic', 'gachaPityLegendary']
        }),
        GachaLog.findAll({
          where: { userId },
          include: [{ model: CosmeticItem, as: 'item' }],
          order: [['createdAt', 'DESC']],
          limit: 15
        }),
        UserItem.findAll({ where: { userId }, attributes: ['itemId'], raw: true })
      ]);

      const ownedSet = new Set(ownedRows.map(o => o.itemId));
      for (const p of enrichedPool) {
        p.owned = ownedSet.has(p.id);
      }

      if (user) {
        userState = {
          notesBalance: user.notesBalance || 0,
          gachaTickets: user.gachaTickets || 0,
          pityEpic: user.gachaPityEpic || 0,
          pityLegendary: user.gachaPityLegendary || 0
        };
      }
      recentLogs = logs.map(l => l.toJSON());
    }

    const byCode = new Map(enrichedPool.map(p => [p.code, p]));
    const crates = CRATE_DEFINITIONS.map(c => {
      const previewItems = c.featuredCodes
        .map(code => byCode.get(code))
        .filter(Boolean);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        descriptionEn: c.descriptionEn,
        prices: c.prices,
        rates: c.rates,
        previewItems
      };
    });

    return {
      rates: GACHA_RATES,
      prices: GACHA_PRICES,
      crates,
      duplicateRefunds: DUPLICATE_REFUND_NOTES,
      pityThresholds: { epic: 10, legendary: 50 },
      pool: enrichedPool,
      userState,
      recentLogs
    };
  }

  async pull(userId, { count = 1, useTicket = false, crateId = 'crate_groove' } = {}) {
    const pullCount = [1, 5, 10].includes(Number(count)) ? Number(count) : 1;
    const crateDef = this._getCrateDef(crateId);
    const costNotes = crateDef.prices[pullCount];

    // Strict Gacha pool query (NEVER includes daily_login_ai or store-only items)
    const poolItems = await CosmeticItem.findAll({
      where: {
        source: 'gacha',
        isGachaAvailable: true,
        isActive: true
      }
    });

    if (poolItems.length === 0) {
      throw new Error('Pool Gacha belum tersedia.');
    }

    const poolByRarity = new Map();
    for (const item of poolItems) {
      if (!poolByRarity.has(item.rarity)) poolByRarity.set(item.rarity, []);
      poolByRarity.get(item.rarity).push(item);
    }

    const batchResult = await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      let notesBalance = user.notesBalance || 0;
      let gachaTickets = user.gachaTickets || 0;

      if (useTicket) {
        if (gachaTickets < pullCount) {
          throw new Error(`Gacha Ticket tidak cukup! Butuh ${pullCount} tiket (milikmu: ${gachaTickets}).`);
        }
        gachaTickets -= pullCount;
      } else {
        if (notesBalance < costNotes) {
          throw new Error(`Notes tidak cukup! Butuh ${costNotes} Notes (saldo: ${notesBalance} Notes).`);
        }
        notesBalance -= costNotes;
        await NotesTransaction.create({
          userId,
          amount: -costNotes,
          balanceAfter: notesBalance,
          reason: `GACHA_PULL_${pullCount}X`,
          metadata: { pullCount }
        }, { transaction: t });
      }

      let pityEpic = user.gachaPityEpic || 0;
      let pityLegendary = user.gachaPityLegendary || 0;
      const pullBatchId = crypto.randomUUID();
      const results = [];
      let totalRefundNotes = 0;

      for (let i = 0; i < pullCount; i++) {
        const { rarity, pityTriggered } = this._rollRarity(pityEpic, pityLegendary, crateDef.rates);
        const picked = this._pickFromPool(poolByRarity, rarity);
        if (!picked) continue;

        if (picked.rarity === 'LEGENDARY' || picked.rarity === 'MYTHIC') {
          pityEpic = 0;
          pityLegendary = 0;
        } else if (picked.rarity === 'EPIC') {
          pityEpic = 0;
          pityLegendary += 1;
        } else {
          pityEpic += 1;
          pityLegendary += 1;
        }

        const grantRes = await cosmeticService.grantItemToUser(userId, picked.id, 'gacha', t);
        const wasDuplicate = grantRes.duplicate;
        const refundNotes = wasDuplicate ? (DUPLICATE_REFUND_NOTES[picked.rarity] || 30) : 0;

        if (refundNotes > 0) {
          notesBalance += refundNotes;
          totalRefundNotes += refundNotes;
          await NotesTransaction.create({
            userId,
            amount: refundNotes,
            balanceAfter: notesBalance,
            reason: 'GACHA_DUPLICATE_REFUND',
            metadata: { itemId: picked.id, rarity: picked.rarity, pullBatchId }
          }, { transaction: t });
        }

        await GachaLog.create({
          userId,
          pullBatchId,
          itemId: picked.id,
          rarity: picked.rarity,
          wasDuplicate,
          refundNotes,
          costType: useTicket ? 'TICKET' : 'NOTES',
          pityTriggered
        }, { transaction: t });

        results.push({
          item: picked.toJSON(),
          rarity: picked.rarity,
          wasDuplicate,
          refundNotes,
          pityTriggered
        });
      }

      await user.update({
        notesBalance,
        gachaTickets,
        gachaPityEpic: pityEpic,
        gachaPityLegendary: pityLegendary
      }, { transaction: t });

      return {
        pullBatchId,
        pullCount,
        costType: useTicket ? 'TICKET' : 'NOTES',
        results,
        totalRefundNotes,
        userState: {
          notesBalance,
          gachaTickets,
          pityEpic,
          pityLegendary
        }
      };
    });

    // Attach live scarcity stats after transaction commits
    const itemsOnly = batchResult.results.map(r => r.item);
    const enrichedItems = await cosmeticService.attachScarcityStats(itemsOnly);
    const enrichedMap = new Map(enrichedItems.map(i => [i.id, i]));
    batchResult.results = batchResult.results.map(r => ({
      ...r,
      item: enrichedMap.get(r.item.id) || r.item
    }));

    return batchResult;
  }
}

export const gachaService = new GachaService();
export default gachaService;
