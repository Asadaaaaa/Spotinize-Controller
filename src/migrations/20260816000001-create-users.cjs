'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.CHAR(36),
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(100),
        unique: true,
        allowNull: false
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      spotify_id: {
        type: Sequelize.STRING(255),
        unique: true,
        allowNull: true
      },
      spotify_connected: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      avatar_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      spotify_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      access_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      games_played: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_score: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      best_score: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      average_score: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      win_rate: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      fastest_guess: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      total_songs_guessed: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      favorite_category: {
        type: Sequelize.STRING(100),
        defaultValue: 'Global Trends'
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
    await queryInterface.dropTable('users');
  }
};
