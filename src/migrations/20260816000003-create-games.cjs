'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('games', {
      id: {
        type: Sequelize.CHAR(36),
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      room_code: {
        type: Sequelize.STRING(10),
        unique: true,
        allowNull: true
      },
      host_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      mode: {
        type: Sequelize.ENUM('SOLO', 'MULTIPLAYER'),
        defaultValue: 'SOLO',
        allowNull: false
      },
      category: {
        type: Sequelize.STRING(100),
        defaultValue: 'Global Trends',
        allowNull: false
      },
      artist_query: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      number_of_songs: {
        type: Sequelize.INTEGER,
        defaultValue: 5,
        allowNull: false
      },
      current_round: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      status: {
        type: Sequelize.ENUM('WAITING', 'STARTING', 'PLAYING', 'ROUND_INTERVAL', 'FINISHED', 'ABANDONED'),
        defaultValue: 'WAITING',
        allowNull: false
      },
      max_players: {
        type: Sequelize.INTEGER,
        defaultValue: 8
      },
      finished_at: {
        type: Sequelize.DATE,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('games');
  }
};
