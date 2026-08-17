'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_rounds', {
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
      round_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      track_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'tracks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'ACTIVE', 'FINISHED'),
        defaultValue: 'PENDING'
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

    await queryInterface.addIndex('game_rounds', ['game_id', 'round_number'], {
      unique: true,
      name: 'game_rounds_game_round_unique'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('game_rounds');
  }
};
