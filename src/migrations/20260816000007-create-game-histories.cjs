'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_histories', {
      id: {
        type: Sequelize.CHAR(36),
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
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
      game_id: {
        type: Sequelize.CHAR(36),
        allowNull: false
      },
      mode: {
        type: Sequelize.ENUM('SOLO', 'MULTIPLAYER'),
        allowNull: false,
        defaultValue: 'SOLO'
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'Global Trends'
      },
      artist_query: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      score: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      round_reached: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      total_rounds: {
        type: Sequelize.INTEGER,
        defaultValue: 5
      },
      correct_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      wrong_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      skipped_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_thinking_time: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      status: {
        type: Sequelize.STRING(50),
        defaultValue: 'COMPLETED'
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('game_histories');
  }
};
