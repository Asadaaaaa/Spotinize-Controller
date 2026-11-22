'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('tracks');

    if (!tableInfo.genre) {
      await queryInterface.addColumn('tracks', 'genre', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
      await queryInterface.addIndex('tracks', ['genre'], { name: 'idx_tracks_genre' });
    }

    if (!tableInfo.release_year) {
      await queryInterface.addColumn('tracks', 'release_year', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
      await queryInterface.addIndex('tracks', ['release_year'], { name: 'idx_tracks_release_year' });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('tracks');
    if (tableInfo.release_year) {
      await queryInterface.removeIndex('tracks', 'idx_tracks_release_year').catch(() => {});
      await queryInterface.removeColumn('tracks', 'release_year');
    }
    if (tableInfo.genre) {
      await queryInterface.removeIndex('tracks', 'idx_tracks_genre').catch(() => {});
      await queryInterface.removeColumn('tracks', 'genre');
    }
  }
};
