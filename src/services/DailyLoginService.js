import axios from 'axios';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import {
  WeeklyLoginSchedule,
  DailyLoginClaim,
  CosmeticItem,
  User,
  Post
} from '../models/index.js';
import { cosmeticService } from './CosmeticService.js';
import { economyService } from './EconomyService.js';
import { officialBotService } from './OfficialBotService.js';
import { spotifyService } from './SpotifyService.js';
import { getWibDateString, getWibWeekKey } from '../utils/WibDate.js';

const ALLOWED_MOTIFS = ['vinyl', 'equalizer', 'spark', 'note', 'crown', 'none'];
const ALLOWED_RING_STYLES = ['solid', 'double', 'dashed', 'notched', 'groove', 'faceted', 'glow', 'crown', 'prism'];
const ALLOWED_ANIMATIONS = ['none', 'pulse', 'shimmer', 'spin'];
const ALLOWED_RARITIES = ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function sanitizeColor(val, fallback) {
  return typeof val === 'string' && HEX_COLOR_REGEX.test(val.trim()) ? val.trim() : fallback;
}

class DailyLoginService {
  constructor() {
    this.generationLocks = new Map();
  }

  async _getForbiddenItemNames() {
    const existing = await CosmeticItem.findAll({ attributes: ['name'], raw: true });
    return existing.map(e => e.name).slice(0, 60);
  }

  _hashWeekSeed(weekKey) {
    let h = 2166136261;
    for (let i = 0; i < weekKey.length; i++) {
      h ^= weekKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  _buildFallbackWeeklyPlan(weekKey) {
    const seed = this._hashWeekSeed(weekKey);
    const palettes = [
      { theme: 'Midnight Synth Week', sub: 'Nuansa neon gelap & ketukan synth retro', primary: '#38bdf8', secondary: '#1e1b4b', motif: 'equalizer', ring: 'glow', anim: 'shimmer', itemTitle: 'Midnight Synth Halo' },
      { theme: 'Jakarta Indie Pulse', sub: 'Energi panggung indie lokal minggu ini', primary: '#fb7185', secondary: '#4c0519', motif: 'note', ring: 'double', anim: 'pulse', itemTitle: 'Indie Stage Crest' },
      { theme: 'Golden Vinyl Revival', sub: 'Putaran piringan klasik penuh nostalgia', primary: '#facc15', secondary: '#713f12', motif: 'vinyl', ring: 'crown', anim: 'spin', itemTitle: 'Revival Gold Ring' },
      { theme: 'Velvet Bass Session', sub: 'Dentuman bass lembut larut malam', primary: '#c084fc', secondary: '#3b0764', motif: 'spark', ring: 'prism', anim: 'shimmer', itemTitle: 'Velvet Bass Aura' }
    ];
    const p = palettes[seed % palettes.length];

    return {
      themeTitle: p.theme,
      themeSubtitle: p.sub,
      generatedByAi: false,
      days: [
        { day: 1, rewardType: 'NOTES', amount: 15, label: '15 Notes' },
        { day: 2, rewardType: 'XP', amount: 50, label: '50 XP' },
        { day: 3, rewardType: 'TICKET', amount: 1, label: '1 Gacha Ticket' },
        {
          day: 4,
          rewardType: 'ITEM',
          label: `${p.itemTitle} Pin (Title)`,
          itemSpec: {
            type: 'TITLE',
            name: `${p.theme.split(' ')[0]} Listener (${weekKey})`,
            description: `Gelar eksklusif Weekly Daily Login minggu ${weekKey}. Tidak dijual di Store.`,
            rarity: 'RARE',
            visualConfig: { color: p.primary, bgColor: 'rgba(56, 189, 248, 0.16)' }
          }
        },
        { day: 5, rewardType: 'NOTES', amount: 30, label: '30 Notes' },
        { day: 6, rewardType: 'STREAK_FREEZE', amount: 1, label: '1 Streak Freeze' },
        {
          day: 7,
          rewardType: 'ITEM',
          label: `${p.itemTitle} Frame`,
          itemSpec: {
            type: 'FRAME',
            name: `${p.itemTitle} (${weekKey})`,
            description: `Bingkai profil eksklusif minggu ${weekKey}. Tidak pernah dijual di Store.`,
            rarity: 'LEGENDARY',
            visualConfig: {
              ringStyle: p.ring,
              primaryColor: p.primary,
              secondaryColor: p.secondary,
              motif: p.motif,
              animation: p.anim
            }
          }
        }
      ]
    };
  }

  async _generateWeeklyPlanViaGemini(weekKey, forbiddenNames = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    let trendSnippet = 'Global & Indonesia Top Hits';
    try {
      const [g, id] = await Promise.all([
        spotifyService.getTopTracks('Global Trends').catch(() => []),
        spotifyService.getTopTracks('Indonesia Trends').catch(() => [])
      ]);
      const sample = [...(g || []).slice(0, 5), ...(id || []).slice(0, 5)]
        .map(t => `${t.artist} - ${t.title}`)
        .join(', ');
      if (sample) trendSnippet = sample;
    } catch {}

    const prompt = `Kamu adalah desainer event mingguan game tebak lagu Spotinize.
Buat susunan lengkap hadiah Daily Login 7 hari (Hari 1 sampai Hari 7) untuk minggu ${weekKey}.
Inspirasi tren musik minggu ini: ${trendSnippet}

ATURAN WAJIB:
1. Tentukan tema mingguan yang keren, singkat, dan berhubungan dengan musik.
2. Buat hadiah untuk day 1 sampai 7 menggunakan variasi tipe: "NOTES" (10..35), "XP" (30..100), "TICKET" (1), "STREAK_FREEZE" (1), dan "ITEM" (wajib minimal ada ITEM di day 7 sebagai Grand Reward, boleh juga 1 ITEM tambahan di day 3/4/5).
3. Untuk setiap reward bertipe "ITEM", buat item kosmetik unik (type: "FRAME" atau "VINYL" atau "TITLE") yang NAMANYA TIDAK BOLEH SAMA dengan daftar terlarang berikut: ${forbiddenNames.join(', ')}.
4. Rarity item: day 1-5 maksimal "EPIC" (wajib animation: "none"), day 7 wajib "LEGENDARY" atau "MYTHIC".
5. Kembalikan JSON valid sesuai struktur:
{
  "themeTitle": "Nama Tema Maks 40 karakter",
  "themeSubtitle": "Subjudul singkat bahasa Indonesia maks 80 karakter",
  "days": [
    { "day": 1, "rewardType": "NOTES", "amount": 15, "label": "15 Notes" },
    { "day": 7, "rewardType": "ITEM", "label": "Nama Item", "itemSpec": { "type": "FRAME", "name": "Nama Unik", "description": "Deskripsi singkat", "rarity": "LEGENDARY", "visualConfig": { "ringStyle": "glow", "primaryColor": "#facc15", "secondaryColor": "#713f12", "motif": "crown", "animation": "shimmer" } } }
  ]
}
Nilai yang diizinkan untuk FRAME visualConfig:
- ringStyle: ${ALLOWED_RING_STYLES.join(' | ')}
- motif: ${ALLOWED_MOTIFS.join(' | ')}
- animation: ${ALLOWED_ANIMATIONS.join(' | ')}
- primaryColor & secondaryColor: hex #RRGGBB
Untuk VINYL visualConfig gunakan { "discColor": "#141414", "grooveColor": "rgba(255,255,255,0.25)", "labelColor": "#...", "rimColor": "#...", "style": "vinyl" }.
Untuk TITLE visualConfig gunakan { "color": "#...", "bgColor": "rgba(255,255,255,0.12)" }.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.75
        }
      },
      { timeout: 15000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    if (!parsed?.themeTitle || !Array.isArray(parsed?.days) || parsed.days.length < 7) {
      return null;
    }
    return { ...parsed, generatedByAi: true };
  }

  _sanitizeVisualConfig(type, rawConfig = {}, rarity = 'RARE') {
    const canAnimate = rarity === 'LEGENDARY' || rarity === 'MYTHIC';
    if (type === 'VINYL') {
      return {
        discColor: sanitizeColor(rawConfig.discColor, '#121216'),
        grooveColor: typeof rawConfig.grooveColor === 'string' ? rawConfig.grooveColor.slice(0, 48) : 'rgba(255,255,255,0.22)',
        labelColor: sanitizeColor(rawConfig.labelColor, '#1db954'),
        rimColor: sanitizeColor(rawConfig.rimColor, '#facc15'),
        style: ['solid', 'geometric', 'faceted', 'vinyl', 'neon', 'gold', 'cassette', 'prism'].includes(rawConfig.style) ? rawConfig.style : 'vinyl'
      };
    }
    if (type === 'TITLE') {
      return {
        color: sanitizeColor(rawConfig.color, '#facc15'),
        bgColor: typeof rawConfig.bgColor === 'string' ? rawConfig.bgColor.slice(0, 48) : 'rgba(250, 204, 21, 0.16)'
      };
    }
    const allowMotif = ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(rarity);
    const rawMotif = ALLOWED_MOTIFS.includes(rawConfig.motif) ? rawConfig.motif : 'spark';
    const rawAnim = ALLOWED_ANIMATIONS.includes(rawConfig.animation) ? rawConfig.animation : 'shimmer';
    return {
      ringStyle: ALLOWED_RING_STYLES.includes(rawConfig.ringStyle) ? rawConfig.ringStyle : 'glow',
      primaryColor: sanitizeColor(rawConfig.primaryColor, '#facc15'),
      secondaryColor: sanitizeColor(rawConfig.secondaryColor, '#78350f'),
      motif: allowMotif ? rawMotif : 'none',
      animation: canAnimate ? (rawAnim === 'none' ? 'shimmer' : rawAnim) : 'none'
    };
  }

  async _materializeWeeklyDays(weekKey, rawDays, forbiddenLowerSet) {
    const normalizedDays = [];
    const byDay = new Map((rawDays || []).map(d => [Number(d.day), d]));

    for (let day = 1; day <= 7; day++) {
      const src = byDay.get(day) || {};
      const rType = String(src.rewardType || 'NOTES').toUpperCase();

      if (rType === 'ITEM' && src.itemSpec) {
        const spec = src.itemSpec;
        const itemType = ['FRAME', 'VINYL', 'TITLE'].includes(String(spec.type || '').toUpperCase())
          ? String(spec.type).toUpperCase()
          : 'FRAME';
        let rarity = ALLOWED_RARITIES.includes(String(spec.rarity || '').toUpperCase())
          ? String(spec.rarity).toUpperCase()
          : (day === 7 ? 'LEGENDARY' : 'RARE');
        if (day === 7 && !['EPIC', 'LEGENDARY', 'MYTHIC'].includes(rarity)) {
          rarity = 'LEGENDARY';
        }

        let cleanName = String(spec.name || `Spotinize Exclusive ${weekKey} D${day}`).trim().slice(0, 100);
        if (forbiddenLowerSet.has(cleanName.toLowerCase())) {
          cleanName = `${cleanName.slice(0, 82)} (${weekKey})`;
        }
        forbiddenLowerSet.add(cleanName.toLowerCase());

        const code = `ai_${weekKey.replace(/[^a-zA-Z0-9]/g, '_')}_d${day}`;
        const visualConfig = this._sanitizeVisualConfig(itemType, spec.visualConfig, rarity);

        // STRICT ANTI-STORE ISOLATION: daily_login_ai items can NEVER enter Store or standard Gacha
        let itemRecord = await CosmeticItem.findOne({ where: { code } });
        if (!itemRecord) {
          itemRecord = await CosmeticItem.create({
            code,
            name: cleanName,
            description: String(spec.description || `Hadiah eksklusif Weekly Daily Login (${weekKey}). Tidak dijual di Store.`).slice(0, 260),
            type: itemType,
            rarity,
            source: 'daily_login_ai',
            isStoreAvailable: false,
            isGachaAvailable: false,
            priceNotes: null,
            visualConfig,
            originTag: `Weekly Exclusive • ${weekKey}`,
            createdWeekKey: weekKey,
            isActive: true
          });
        }

        normalizedDays.push({
          day,
          rewardType: 'ITEM',
          itemId: itemRecord.id,
          itemCode: itemRecord.code,
          itemName: itemRecord.name,
          itemType: itemRecord.type,
          rarity: itemRecord.rarity,
          visualConfig: itemRecord.visualConfig,
          label: itemRecord.name
        });
        continue;
      }

      if (rType === 'TICKET') {
        const amt = Math.max(1, Math.min(2, parseInt(src.amount, 10) || 1));
        normalizedDays.push({ day, rewardType: 'TICKET', amount: amt, label: `${amt} Gacha Ticket` });
      } else if (rType === 'STREAK_FREEZE') {
        normalizedDays.push({ day, rewardType: 'STREAK_FREEZE', amount: 1, label: '1 Streak Freeze' });
      } else if (rType === 'XP') {
        const amt = Math.max(30, Math.min(150, parseInt(src.amount, 10) || 60));
        normalizedDays.push({ day, rewardType: 'XP', amount: amt, label: `${amt} XP` });
      } else {
        const amt = Math.max(10, Math.min(35, parseInt(src.amount, 10) || (day * 4 + 10)));
        normalizedDays.push({ day, rewardType: 'NOTES', amount: amt, label: `${amt} Notes` });
      }
    }

    return normalizedDays;
  }

  async ensureWeeklySchedule(weekKey = getWibWeekKey()) {
    const existing = await WeeklyLoginSchedule.findOne({ where: { weekKey } });
    if (existing) return existing;

    if (this.generationLocks.has(weekKey)) {
      return this.generationLocks.get(weekKey);
    }

    const promise = (async () => {
      try {
        const doubleCheck = await WeeklyLoginSchedule.findOne({ where: { weekKey } });
        if (doubleCheck) return doubleCheck;

        const forbiddenNames = await this._getForbiddenItemNames();
        const forbiddenLower = new Set(forbiddenNames.map(n => n.toLowerCase()));

        let plan = null;
        try {
          plan = await this._generateWeeklyPlanViaGemini(weekKey, forbiddenNames);
        } catch (err) {
          console.warn('[DailyLoginService] AI generation fallback:', err.message);
        }

        if (!plan) {
          plan = this._buildFallbackWeeklyPlan(weekKey);
        }

        const materializedDays = await this._materializeWeeklyDays(weekKey, plan.days, forbiddenLower);

        const created = await WeeklyLoginSchedule.create({
          weekKey,
          themeTitle: String(plan.themeTitle || `Weekly Mix ${weekKey}`).slice(0, 120),
          themeSubtitle: String(plan.themeSubtitle || 'Klaim hadiah eksklusif tiap hari!').slice(0, 250),
          generatedByAi: Boolean(plan.generatedByAi),
          daysJson: materializedDays
        });

        // Announce via @spotinize official account
        try {
          const bot = await officialBotService.ensureOfficialAccount();
          const day7 = materializedDays.find(d => d.day === 7);
          const rewardText = day7?.itemName
            ? `Grand Reward Hari ke-7: **${day7.itemName}** (${day7.rarity} — Eksklusif Mingguan, tidak dijual di Store!)`
            : 'Klaim hadiah harianmu selama 7 hari penuh!';
          await Post.create({
            userId: bot.id,
            type: 'official_ai',
            subtype: 'news',
            content: `Daily Login Minggu ${weekKey}: **${created.themeTitle}**! ${created.themeSubtitle}. ${rewardText}`,
            metadataJson: { weekKey, themeTitle: created.themeTitle, generatedByAi: created.generatedByAi }
          });
        } catch (err) {
          console.warn('[DailyLoginService] Bot announcement notice:', err.message);
        }

        return created;
      } finally {
        this.generationLocks.delete(weekKey);
      }
    })();

    this.generationLocks.set(weekKey, promise);
    return promise;
  }

  async getStatus(userId) {
    const weekKey = getWibWeekKey();
    const todayWib = getWibDateString();
    const schedule = await this.ensureWeeklySchedule(weekKey);

    const claims = userId
      ? await DailyLoginClaim.findAll({
          where: { userId, weekKey },
          order: [['dayNumber', 'ASC']]
        })
      : [];

    const claimedDays = new Set(claims.map(c => c.dayNumber));
    const claimedToday = claims.some(c => String(c.claimDateWib).slice(0, 10) === todayWib);
    const nextDayNumber = claimedDays.size >= 7 ? 7 : claimedDays.size + 1;

    // Hydrate live scarcity stats for ITEM days
    const days = Array.isArray(schedule.daysJson) ? [...schedule.daysJson] : [];
    const itemIds = days.filter(d => d.rewardType === 'ITEM' && d.itemId).map(d => d.itemId);
    const itemRows = itemIds.length > 0
      ? await CosmeticItem.findAll({ where: { id: { [Op.in]: itemIds } } })
      : [];
    const enrichedItems = await cosmeticService.attachScarcityStats(itemRows);
    const itemMap = new Map(enrichedItems.map(i => [i.id, i]));

    const hydratedDays = days.map(d => {
      const itemInfo = d.itemId ? itemMap.get(d.itemId) : null;
      return {
        ...d,
        item: itemInfo || null,
        claimed: claimedDays.has(d.day),
        isClaimableToday: !claimedToday && d.day === nextDayNumber && claimedDays.size < 7
      };
    });

    return {
      weekKey,
      todayWib,
      themeTitle: schedule.themeTitle,
      themeSubtitle: schedule.themeSubtitle,
      generatedByAi: schedule.generatedByAi,
      claimedToday,
      claimedCount: claimedDays.size,
      canClaimToday: !claimedToday && claimedDays.size < 7,
      nextDayNumber,
      days: hydratedDays
    };
  }

  async claimToday(userId) {
    const weekKey = getWibWeekKey();
    const todayWib = getWibDateString();
    const schedule = await this.ensureWeeklySchedule(weekKey);

    const outcome = await sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      const existingClaims = await DailyLoginClaim.findAll({
        where: { userId, weekKey },
        order: [['dayNumber', 'ASC']],
        transaction: t
      });

      if (existingClaims.some(c => String(c.claimDateWib).slice(0, 10) === todayWib)) {
        throw new Error('Hadiah Daily Login hari ini sudah diklaim.');
      }

      if (existingClaims.length >= 7) {
        throw new Error('Semua 7 hadiah Daily Login minggu ini sudah diklaim!');
      }

      const dayNumber = existingClaims.length + 1;
      const days = Array.isArray(schedule.daysJson) ? schedule.daysJson : [];
      const dayReward = days.find(d => Number(d.day) === dayNumber);
      if (!dayReward) {
        throw new Error('Konfigurasi hadiah hari ini tidak ditemukan.');
      }

      const summary = { dayNumber, rewardType: dayReward.rewardType, label: dayReward.label };

      if (dayReward.rewardType === 'NOTES') {
        const res = await economyService.creditNotes(userId, dayReward.amount, `DAILY_LOGIN_W${weekKey}_D${dayNumber}`, { weekKey, dayNumber }, t);
        summary.notesBalance = res?.balance;
        summary.amount = dayReward.amount;
      } else if (dayReward.rewardType === 'TICKET') {
        const nextTickets = await economyService.grantTickets(userId, dayReward.amount, t);
        summary.gachaTickets = nextTickets;
        summary.amount = dayReward.amount;
      } else if (dayReward.rewardType === 'STREAK_FREEZE') {
        const nextFreezes = Math.min(3, (user.streakFreezes || 0) + 1);
        await user.update({ streakFreezes: nextFreezes }, { transaction: t });
        summary.streakFreezes = nextFreezes;
        summary.amount = 1;
      } else if (dayReward.rewardType === 'XP') {
        const nextXp = (user.xp || 0) + (dayReward.amount || 50);
        await user.update({ xp: nextXp }, { transaction: t });
        summary.xp = nextXp;
        summary.amount = dayReward.amount;
      } else if (dayReward.rewardType === 'ITEM' && dayReward.itemId) {
        const grant = await cosmeticService.grantItemToUser(userId, dayReward.itemId, 'daily_login_ai', t);
        if (grant.duplicate) {
          const refund = await economyService.creditNotes(userId, 45, 'DAILY_LOGIN_DUPLICATE_FALLBACK', { itemId: dayReward.itemId }, t);
          summary.duplicateRefundNotes = 45;
          summary.notesBalance = refund?.balance;
        }
        summary.itemId = dayReward.itemId;
        summary.itemName = dayReward.itemName;
        summary.rarity = dayReward.rarity;
      }

      await DailyLoginClaim.create({
        userId,
        weekKey,
        dayNumber,
        claimDateWib: todayWib,
        rewardPayload: summary
      }, { transaction: t });

      return summary;
    });

    const status = await this.getStatus(userId);
    return {
      claimed: outcome,
      status
    };
  }
}

export const dailyLoginService = new DailyLoginService();
export default dailyLoginService;
