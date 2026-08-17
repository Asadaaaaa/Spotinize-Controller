'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tracks', {
      id: {
        type: Sequelize.CHAR(36),
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      spotify_id: {
        type: Sequelize.STRING(255),
        unique: true,
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
      primary_artist: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      album: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      album_art: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      preview_url: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      local_audio_path: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(100),
        defaultValue: 'Global Trends'
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        defaultValue: 30000
      },
      popularity: {
        type: Sequelize.INTEGER,
        defaultValue: 50
      },
      genres: {
        type: Sequelize.TEXT,
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
    await queryInterface.dropTable('tracks');
  }
};
