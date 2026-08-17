'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_players', {
      id: {
        type: Sequelize.CHAR(36),
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      game_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'games',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      score: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      current_round: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      current_reveal_level: {
        type: Sequelize.FLOAT,
        defaultValue: 0.1
      },
      remaining_attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 3
      },
      total_thinking_time: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      round_thinking_time: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      round_started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('THINKING', 'GUESSED', 'WRONG', 'SKIPPED', 'LEFT', 'WAITING', 'FINISHED'),
        defaultValue: 'THINKING'
      },
      connection_status: {
        type: Sequelize.ENUM('CONNECTED', 'DISCONNECTED'),
        defaultValue: 'CONNECTED'
      },
      disconnected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_host: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_ready: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      rank: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('game_players', ['game_id', 'user_id'], {
      unique: true,
      name: 'game_players_game_user_unique'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('game_players');
  }
};
