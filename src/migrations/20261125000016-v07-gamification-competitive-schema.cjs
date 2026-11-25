'use strict';

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map(t => (typeof t === 'string' ? t : t.tableName || Object.values(t)[0]).toLowerCase());
  return normalized.includes(tableName.toLowerCase());
}

async function addColumnsIfMissing(queryInterface, tableName, columns) {
  const desc = await queryInterface.describeTable(tableName);
  for (const [colName, colDef] of columns) {
    if (!desc[colName]) {
      await queryInterface.addColumn(tableName, colName, colDef);
    }
  }
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  const indexes = await queryInterface.showIndex(tableName);
  const exists = indexes.some(idx => idx.name === options.name);
  if (!exists) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Extend `users` table
    await addColumnsIfMissing(queryInterface, 'users', [
      ['notes_balance', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['gacha_tickets', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['streak_freezes', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['xp', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['level', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }],
      ['equipped_frame_id', { type: Sequelize.CHAR(36), allowNull: true }],
      ['equipped_vinyl_id', { type: Sequelize.CHAR(36), allowNull: true }],
      ['equipped_title_id', { type: Sequelize.CHAR(36), allowNull: true }],
      ['gacha_pity_epic', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['gacha_pity_legendary', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['all_time_power_score', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['official_games_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['official_avg_score', { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 }],
      ['daily_points_total', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }]
    ]);

    // 2. Extend `games` table
    await addColumnsIfMissing(queryInterface, 'games', [
      ['game_subtype', { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'CLASSIC' }],
      ['daily_date', { type: Sequelize.DATEONLY, allowNull: true }],
      ['season_id', { type: Sequelize.CHAR(36), allowNull: true }],
      ['ranked_duel_id', { type: Sequelize.CHAR(36), allowNull: true }]
    ]);

    // 3. Extend `game_players` table
    await addColumnsIfMissing(queryInterface, 'game_players', [
      ['lives', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 }],
      ['is_eliminated', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['team_id', { type: Sequelize.STRING(16), allowNull: true }],
      ['buzz_lockout_until', { type: Sequelize.DATE, allowNull: true }]
    ]);

    // 4. Extend `game_histories` table
    await addColumnsIfMissing(queryInterface, 'game_histories', [
      ['game_subtype', { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'CLASSIC' }],
      ['is_official_eligible', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }],
      ['perfect_run', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
      ['xp_earned', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['notes_earned', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
      ['rp_delta', { type: Sequelize.INTEGER, allowNull: true }]
    ]);

    // 5. Create `cosmetic_items`
    if (!(await tableExists(queryInterface, 'cosmetic_items'))) {
      await queryInterface.createTable('cosmetic_items', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        code: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        name: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.STRING(280), allowNull: true },
        type: { type: Sequelize.STRING(24), allowNull: false }, // FRAME | VINYL | TITLE
        rarity: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'COMMON' }, // COMMON | RARE | EPIC | LEGENDARY | MYTHIC
        source: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'store' }, // store | gacha | daily_login_ai | ranked | mastery
        is_store_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        is_gacha_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        price_notes: { type: Sequelize.INTEGER, allowNull: true },
        visual_config: { type: Sequelize.JSON, allowNull: true },
        origin_tag: { type: Sequelize.STRING(120), allowNull: true },
        created_week_key: { type: Sequelize.STRING(16), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'cosmetic_items', ['source', 'is_store_available', 'is_gacha_available'], {
        name: 'idx_cosmetic_items_pool'
      });
    }

    // 6. Create `user_items`
    if (!(await tableExists(queryInterface, 'user_items'))) {
      await queryInterface.createTable('user_items', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        item_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'cosmetic_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        acquired_via: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'store' },
        acquired_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'user_items', ['user_id', 'item_id'], {
        unique: true,
        name: 'user_items_user_item_unique'
      });
      await addIndexIfMissing(queryInterface, 'user_items', ['item_id'], {
        name: 'idx_user_items_item_id'
      });
    }

    // 7. Create `notes_transactions`
    if (!(await tableExists(queryInterface, 'notes_transactions'))) {
      await queryInterface.createTable('notes_transactions', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        amount: { type: Sequelize.INTEGER, allowNull: false },
        balance_after: { type: Sequelize.INTEGER, allowNull: false },
        reason: { type: Sequelize.STRING(64), allowNull: false },
        metadata: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'notes_transactions', ['user_id', 'created_at'], {
        name: 'idx_notes_tx_user_created'
      });
    }

    // 8. Create `weekly_login_schedules`
    if (!(await tableExists(queryInterface, 'weekly_login_schedules'))) {
      await queryInterface.createTable('weekly_login_schedules', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        week_key: { type: Sequelize.STRING(16), allowNull: false, unique: true },
        theme_title: { type: Sequelize.STRING(120), allowNull: false },
        theme_subtitle: { type: Sequelize.STRING(255), allowNull: true },
        generated_by_ai: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        days_json: { type: Sequelize.JSON, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // 9. Create `daily_login_claims`
    if (!(await tableExists(queryInterface, 'daily_login_claims'))) {
      await queryInterface.createTable('daily_login_claims', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        week_key: { type: Sequelize.STRING(16), allowNull: false },
        day_number: { type: Sequelize.INTEGER, allowNull: false },
        claim_date_wib: { type: Sequelize.DATEONLY, allowNull: false },
        reward_payload: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'daily_login_claims', ['user_id', 'week_key', 'day_number'], {
        unique: true,
        name: 'dlc_user_week_day_unique'
      });
      await addIndexIfMissing(queryInterface, 'daily_login_claims', ['user_id', 'claim_date_wib'], {
        unique: true,
        name: 'dlc_user_date_unique'
      });
    }

    // 10. Create `gacha_logs`
    if (!(await tableExists(queryInterface, 'gacha_logs'))) {
      await queryInterface.createTable('gacha_logs', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        pull_batch_id: { type: Sequelize.CHAR(36), allowNull: false },
        item_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'cosmetic_items', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        rarity: { type: Sequelize.STRING(24), allowNull: false },
        was_duplicate: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        refund_notes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        cost_type: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'NOTES' },
        pity_triggered: { type: Sequelize.STRING(24), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'gacha_logs', ['user_id', 'created_at'], {
        name: 'idx_gacha_logs_user_created'
      });
    }

    // 11. Create `daily_challenges`
    if (!(await tableExists(queryInterface, 'daily_challenges'))) {
      await queryInterface.createTable('daily_challenges', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        daily_date: { type: Sequelize.DATEONLY, allowNull: false, unique: true },
        daily_number: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        track_ids_json: { type: Sequelize.JSON, allowNull: false },
        pool_summary: { type: Sequelize.JSON, allowNull: true },
        announcement_post_id: { type: Sequelize.CHAR(36), allowNull: true },
        recap_posted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // 12. Create `daily_attempts`
    if (!(await tableExists(queryInterface, 'daily_attempts'))) {
      await queryInterface.createTable('daily_attempts', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        daily_date: { type: Sequelize.DATEONLY, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        game_id: { type: Sequelize.CHAR(36), allowNull: false },
        score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        correct_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_thinking_time: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        emoji_grid: { type: Sequelize.STRING(255), allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'IN_PROGRESS' },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'daily_attempts', ['daily_date', 'user_id'], {
        unique: true,
        name: 'daily_attempts_date_user_unique'
      });
      await addIndexIfMissing(queryInterface, 'daily_attempts', ['daily_date', 'status', 'score'], {
        name: 'idx_daily_attempts_leaderboard'
      });
    }

    // 13. Create `ranked_seasons`
    if (!(await tableExists(queryInterface, 'ranked_seasons'))) {
      await queryInterface.createTable('ranked_seasons', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        season_number: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        name: { type: Sequelize.STRING(80), allowNull: false },
        starts_at: { type: Sequelize.DATE, allowNull: false },
        ends_at: { type: Sequelize.DATE, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        rewards_finalized: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // 14. Create `user_ranked_profiles`
    if (!(await tableExists(queryInterface, 'user_ranked_profiles'))) {
      await queryInterface.createTable('user_ranked_profiles', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        season_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'ranked_seasons', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        rp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        tier: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'UNRANKED' },
        placement_games_played: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        demotion_shield_games: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ranked_games_played: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ranked_wins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        peak_tier: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'UNRANKED' },
        peak_rp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'user_ranked_profiles', ['user_id', 'season_id'], {
        unique: true,
        name: 'urp_user_season_unique'
      });
      await addIndexIfMissing(queryInterface, 'user_ranked_profiles', ['season_id', 'rp'], {
        name: 'idx_urp_season_rp'
      });
    }

    // 15. Create `ranked_duels`
    if (!(await tableExists(queryInterface, 'ranked_duels'))) {
      await queryInterface.createTable('ranked_duels', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        season_id: { type: Sequelize.CHAR(36), allowNull: false },
        challenger_id: { type: Sequelize.CHAR(36), allowNull: false },
        opponent_id: { type: Sequelize.CHAR(36), allowNull: false },
        source_game_id: { type: Sequelize.CHAR(36), allowNull: true },
        challenger_game_id: { type: Sequelize.CHAR(36), allowNull: true },
        opponent_game_id: { type: Sequelize.CHAR(36), allowNull: true },
        challenger_score: { type: Sequelize.INTEGER, allowNull: true },
        opponent_score: { type: Sequelize.INTEGER, allowNull: true },
        winner_id: { type: Sequelize.CHAR(36), allowNull: true },
        status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'PENDING' },
        expires_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'ranked_duels', ['opponent_id', 'status'], {
        name: 'idx_ranked_duels_opponent'
      });
    }

    // 16. Create `user_category_masteries`
    if (!(await tableExists(queryInterface, 'user_category_masteries'))) {
      await queryInterface.createTable('user_category_masteries', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        category: { type: Sequelize.STRING(64), allowNull: false },
        xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        tier: { type: Sequelize.STRING(24), allowNull: false, defaultValue: 'NONE' },
        correct_songs: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        games_played: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'user_category_masteries', ['user_id', 'category'], {
        unique: true,
        name: 'ucm_user_category_unique'
      });
    }

    // 17. Create `user_quests`
    if (!(await tableExists(queryInterface, 'user_quests'))) {
      await queryInterface.createTable('user_quests', {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        quest_type: { type: Sequelize.STRING(16), allowNull: false }, // DAILY | WEEKLY
        period_key: { type: Sequelize.STRING(24), allowNull: false },
        quest_code: { type: Sequelize.STRING(48), allowNull: false },
        title: { type: Sequelize.STRING(160), allowNull: false },
        target_value: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        progress_value: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reward_notes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reward_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reward_tickets: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'ACTIVE' }, // ACTIVE | COMPLETED | CLAIMED
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await addIndexIfMissing(queryInterface, 'user_quests', ['user_id', 'period_key', 'quest_code'], {
        unique: true,
        name: 'uq_user_period_code_unique'
      });
    }

    // 18. Grant existing non-official users a 1-time starter bonus (100 Notes + 1 Gacha Ticket)
    await queryInterface.sequelize.query(
      `UPDATE users SET notes_balance = 100, gacha_tickets = 1 WHERE is_official = 0 AND notes_balance = 0 AND gacha_tickets = 0`
    );
  },

  async down(queryInterface) {
    const tablesToDrop = [
      'user_quests',
      'user_category_masteries',
      'ranked_duels',
      'user_ranked_profiles',
      'ranked_seasons',
      'daily_attempts',
      'daily_challenges',
      'gacha_logs',
      'daily_login_claims',
      'weekly_login_schedules',
      'notes_transactions',
      'user_items',
      'cosmetic_items'
    ];
    for (const t of tablesToDrop) {
      if (await tableExists(queryInterface, t)) {
        await queryInterface.dropTable(t);
      }
    }
  }
};
