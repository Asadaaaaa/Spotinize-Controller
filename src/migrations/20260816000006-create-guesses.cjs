'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('guesses', {
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
      round_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'game_rounds',
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
      guessed_title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      guessed_artist: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      is_correct: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      attempt_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      reveal_level: {
        type: Sequelize.FLOAT,
        allowNull: false
      },
      thinking_time: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0
      },
      points_awarded: {
        type: Sequelize.INTEGER,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('guesses');
  }
};
