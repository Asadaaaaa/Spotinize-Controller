'use strict';

const crypto = require('crypto');

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map(t => (typeof t === 'string' ? t : t.tableName || Object.values(t)[0]).toLowerCase());
  return normalized.includes(tableName.toLowerCase());
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add columns to `users`
    const usersDesc = await queryInterface.describeTable('users');
    if (!usersDesc.is_official) {
      await queryInterface.addColumn('users', 'is_official', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
    if (!usersDesc.current_streak) {
      await queryInterface.addColumn('users', 'current_streak', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!usersDesc.longest_streak) {
      await queryInterface.addColumn('users', 'longest_streak', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!usersDesc.last_played_date) {
      await queryInterface.addColumn('users', 'last_played_date', {
        type: Sequelize.DATEONLY,
        allowNull: true
      });
    }

    // 2. Add `challenge_post_id` to `games`
    const gamesDesc = await queryInterface.describeTable('games');
    if (!gamesDesc.challenge_post_id) {
      await queryInterface.addColumn('games', 'challenge_post_id', {
        type: Sequelize.CHAR(36),
        allowNull: true
      });
    }

    // 3. Relax `notifications.type` from rigid ENUM to STRING(40)
    if (await tableExists(queryInterface, 'notifications')) {
      await queryInterface.changeColumn('notifications', 'type', {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'INVITE'
      });
    }

    // 4. Create `follows` table
    if (!(await tableExists(queryInterface, 'follows'))) {
      await queryInterface.createTable('follows', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        follower_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        following_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('follows', ['follower_id', 'following_id'], {
        unique: true,
        name: 'follows_follower_following_unique'
      });
      await queryInterface.addIndex('follows', ['following_id'], {
        name: 'idx_follows_following_id'
      });
    }

    // 4b. Migrate ACCEPTED rows from `friends` into Mutual Follow pairs in `follows`
    if (await tableExists(queryInterface, 'friends')) {
      const [acceptedFriends] = await queryInterface.sequelize.query(
        `SELECT user_id, friend_id, created_at FROM friends WHERE status = 'ACCEPTED'`
      );
      for (const row of acceptedFriends || []) {
        if (!row.user_id || !row.friend_id || row.user_id === row.friend_id) continue;
        const createdAt = row.created_at ? new Date(row.created_at) : new Date();
        const pairs = [
          [row.user_id, row.friend_id],
          [row.friend_id, row.user_id]
        ];
        for (const [followerId, followingId] of pairs) {
          await queryInterface.sequelize.query(
            `INSERT IGNORE INTO follows (id, follower_id, following_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            {
              replacements: [crypto.randomUUID(), followerId, followingId, createdAt, createdAt]
            }
          );
        }
      }
    }

    // 5. Create `posts` table
    if (!(await tableExists(queryInterface, 'posts'))) {
      await queryInterface.createTable('posts', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        type: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'note' // 'note' | 'blind_drop' | 'challenge' | 'auto_activity' | 'official_ai'
        },
        subtype: {
          type: Sequelize.STRING(40),
          allowNull: true // 'news' | 'new_release' | 'hardest_song' | 'fun_fact' | 'official_blind_drop' | 'personal_best' | 'multiplayer_win' | 'pinned_songs' | 'streak_milestone'
        },
        content: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        content_en: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        source_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        source_name: {
          type: Sequelize.STRING(120),
          allowNull: true
        },
        track_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        track_title: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        track_artist: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        track_cover: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        track_preview_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        track_spotify_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        source_game_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        metadata_json: {
          type: Sequelize.JSON,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('posts', ['user_id', 'created_at'], { name: 'idx_posts_user_created' });
      await queryInterface.addIndex('posts', ['type', 'created_at'], { name: 'idx_posts_type_created' });
      await queryInterface.addIndex('posts', ['created_at'], { name: 'idx_posts_created_at' });
    }

    // 6. Create `post_reactions` table
    if (!(await tableExists(queryInterface, 'post_reactions'))) {
      await queryInterface.createTable('post_reactions', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        post_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'posts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        emoji: {
          type: Sequelize.STRING(16),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('post_reactions', ['post_id', 'user_id', 'emoji'], {
        unique: true,
        name: 'post_reactions_unique'
      });
    }

    // 7. Create `post_comments` table
    if (!(await tableExists(queryInterface, 'post_comments'))) {
      await queryInterface.createTable('post_comments', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        post_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'posts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        content: {
          type: Sequelize.STRING(500),
          allowNull: false
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('post_comments', ['post_id', 'created_at'], {
        name: 'idx_post_comments_post_created'
      });
    }

    // 8. Create `blind_drop_attempts` table
    if (!(await tableExists(queryInterface, 'blind_drop_attempts'))) {
      await queryInterface.createTable('blind_drop_attempts', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        post_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'posts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        solved: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        gave_up: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        reveal_level: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0.5
        },
        attempts_used: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('blind_drop_attempts', ['post_id', 'user_id'], {
        unique: true,
        name: 'blind_drop_attempts_post_user_unique'
      });
    }

    // 9. Create `challenge_entries` table
    if (!(await tableExists(queryInterface, 'challenge_entries'))) {
      await queryInterface.createTable('challenge_entries', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        post_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'posts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        game_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        score: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        thinking_time: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('challenge_entries', ['post_id', 'user_id'], {
        unique: true,
        name: 'challenge_entries_post_user_unique'
      });
    }

    // 10. Create `user_pinned_songs` table
    if (!(await tableExists(queryInterface, 'user_pinned_songs'))) {
      await queryInterface.createTable('user_pinned_songs', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        position: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1
        },
        track_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        artist: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        cover_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        preview_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        spotify_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('user_pinned_songs', ['user_id', 'position'], {
        name: 'idx_user_pinned_songs_user_pos'
      });
    }

    // 11. Create `saved_tracks` table
    if (!(await tableExists(queryInterface, 'saved_tracks'))) {
      await queryInterface.createTable('saved_tracks', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        track_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        artist: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        cover_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        preview_url: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        spotify_id: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        track_key: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        source_post_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('saved_tracks', ['user_id', 'track_key'], {
        unique: true,
        name: 'saved_tracks_user_track_key_unique'
      });
    }

    // 12. Create `ai_content_logs` table
    if (!(await tableExists(queryInterface, 'ai_content_logs'))) {
      await queryInterface.createTable('ai_content_logs', {
        id: {
          type: Sequelize.CHAR(36),
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },
        topic_hash: {
          type: Sequelize.STRING(128),
          allowNull: false,
          unique: true
        },
        category: {
          type: Sequelize.STRING(40),
          allowNull: false
        },
        raw_source: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        post_id: {
          type: Sequelize.CHAR(36),
          allowNull: true
        },
        status: {
          type: Sequelize.STRING(32),
          allowNull: false,
          defaultValue: 'PUBLISHED'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
    }
  },

  async down(queryInterface) {
    const tablesToDrop = [
      'ai_content_logs',
      'saved_tracks',
      'user_pinned_songs',
      'challenge_entries',
      'blind_drop_attempts',
      'post_comments',
      'post_reactions',
      'posts',
      'follows'
    ];
    for (const t of tablesToDrop) {
      if (await tableExists(queryInterface, t)) {
        await queryInterface.dropTable(t);
      }
    }
    const gamesDesc = await queryInterface.describeTable('games');
    if (gamesDesc.challenge_post_id) {
      await queryInterface.removeColumn('games', 'challenge_post_id');
    }
    const usersDesc = await queryInterface.describeTable('users');
    for (const col of ['last_played_date', 'longest_streak', 'current_streak', 'is_official']) {
      if (usersDesc[col]) {
        await queryInterface.removeColumn('users', col);
      }
    }
  }
};
