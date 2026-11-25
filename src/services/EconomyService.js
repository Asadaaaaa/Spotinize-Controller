import { sequelize } from '../config/database.js';
import { User, CosmeticItem, NotesTransaction } from '../models/index.js';
import { cosmeticService } from './CosmeticService.js';

export const STREAK_FREEZE_PRICE = 250;
export const MAX_STREAK_FREEZES = 2;
export const GACHA_TICKET_PRICE = 200;

class EconomyService {
  async creditNotes(userId, amount, reason, metadata = null, externalTx = null) {
    const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (!userId || safeAmount === 0) return null;

    const run = async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      const nextBalance = (user.notesBalance || 0) + safeAmount;
      await user.update({ notesBalance: nextBalance }, { transaction: t });

      await NotesTransaction.create({
        userId,
        amount: safeAmount,
        balanceAfter: nextBalance,
        reason,
        metadata
      }, { transaction: t });

      return { balance: nextBalance, amount: safeAmount };
    };

    return externalTx ? run(externalTx) : sequelize.transaction(run);
  }

  async debitNotes(userId, amount, reason, metadata = null, externalTx = null) {
    const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
    if (!userId || safeAmount <= 0) throw new Error('Nominal Notes tidak valid');

    const run = async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      const current = user.notesBalance || 0;
      if (current < safeAmount) {
        throw new Error(`Notes tidak cukup! Butuh ${safeAmount} Notes (saldo kamu: ${current} Notes).`);
      }

      const nextBalance = current - safeAmount;
      await user.update({ notesBalance: nextBalance }, { transaction: t });

      await NotesTransaction.create({
        userId,
        amount: -safeAmount,
        balanceAfter: nextBalance,
        reason,
        metadata
      }, { transaction: t });

      return { balance: nextBalance, spent: safeAmount };
    };

    return externalTx ? run(externalTx) : sequelize.transaction(run);
  }

  async grantTickets(userId, count, externalTx = null) {
    const safeCount = Math.max(0, Math.round(Number(count) || 0));
    if (!userId || safeCount === 0) return 0;

    const run = async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');
      const next = (user.gachaTickets || 0) + safeCount;
      await user.update({ gachaTickets: next }, { transaction: t });
      return next;
    };

    return externalTx ? run(externalTx) : sequelize.transaction(run);
  }

  async buyStreakFreeze(userId) {
    return sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      const currentFreezes = user.streakFreezes || 0;
      if (currentFreezes >= MAX_STREAK_FREEZES) {
        throw new Error(`Slot Streak Freeze sudah penuh (maksimal ${MAX_STREAK_FREEZES}).`);
      }

      if ((user.notesBalance || 0) < STREAK_FREEZE_PRICE) {
        throw new Error(`Notes tidak cukup! Streak Freeze butuh ${STREAK_FREEZE_PRICE} Notes.`);
      }

      const nextBalance = (user.notesBalance || 0) - STREAK_FREEZE_PRICE;
      const nextFreezes = currentFreezes + 1;

      await user.update({
        notesBalance: nextBalance,
        streakFreezes: nextFreezes
      }, { transaction: t });

      await NotesTransaction.create({
        userId,
        amount: -STREAK_FREEZE_PRICE,
        balanceAfter: nextBalance,
        reason: 'BUY_STREAK_FREEZE',
        metadata: { streakFreezesAfter: nextFreezes }
      }, { transaction: t });

      return {
        notesBalance: nextBalance,
        streakFreezes: nextFreezes
      };
    });
  }

  async buyGachaTicket(userId, quantity = 1) {
    const qty = Math.max(1, Math.min(10, parseInt(quantity, 10) || 1));
    const totalCost = qty * GACHA_TICKET_PRICE;

    return sequelize.transaction(async (t) => {
      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      if ((user.notesBalance || 0) < totalCost) {
        throw new Error(`Notes tidak cukup! Butuh ${totalCost} Notes untuk ${qty} Gacha Ticket.`);
      }

      const nextBalance = (user.notesBalance || 0) - totalCost;
      const nextTickets = (user.gachaTickets || 0) + qty;

      await user.update({
        notesBalance: nextBalance,
        gachaTickets: nextTickets
      }, { transaction: t });

      await NotesTransaction.create({
        userId,
        amount: -totalCost,
        balanceAfter: nextBalance,
        reason: 'BUY_GACHA_TICKET',
        metadata: { quantity: qty }
      }, { transaction: t });

      return {
        notesBalance: nextBalance,
        gachaTickets: nextTickets,
        purchased: qty
      };
    });
  }

  async purchaseStoreItem(userId, itemId) {
    return sequelize.transaction(async (t) => {
      const item = await CosmeticItem.findByPk(itemId, { transaction: t });
      if (!item || !item.isActive) {
        throw new Error('Item tidak ditemukan.');
      }

      // STRICT ANTI-LEAK CHECK: AI Daily Login / Gacha exclusives cannot be bought in Store
      if (item.source !== 'store' || !item.isStoreAvailable) {
        throw new Error('Item eksklusif ini tidak tersedia di Store.');
      }

      const price = Number(item.priceNotes || 0);
      if (price <= 0) {
        throw new Error('Harga item tidak valid.');
      }

      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan');

      const grantRes = await cosmeticService.grantItemToUser(userId, item.id, 'store', t);
      if (grantRes.duplicate) {
        throw new Error('Kamu sudah memiliki item ini di Locker.');
      }

      if ((user.notesBalance || 0) < price) {
        throw new Error(`Notes tidak cukup! Butuh ${price} Notes (saldo: ${user.notesBalance || 0} Notes).`);
      }

      const nextBalance = (user.notesBalance || 0) - price;
      await user.update({ notesBalance: nextBalance }, { transaction: t });

      await NotesTransaction.create({
        userId,
        amount: -price,
        balanceAfter: nextBalance,
        reason: 'BUY_STORE_ITEM',
        metadata: { itemId: item.id, code: item.code, name: item.name }
      }, { transaction: t });

      return {
        item: item.toJSON(),
        notesBalance: nextBalance
      };
    });
  }
}

export const economyService = new EconomyService();
export default economyService;
