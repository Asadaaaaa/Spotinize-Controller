'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('tracks');
    const cols = [
      ['release_date', { type: Sequelize.STRING(32), allowNull: true }],
      ['writers', { type: Sequelize.STRING(500), allowNull: true }],
      ['description', { type: Sequelize.TEXT, allowNull: true }],
      ['description_en', { type: Sequelize.TEXT, allowNull: true }],
      ['youtube_video_id', { type: Sequelize.STRING(32), allowNull: true }],
      ['detail_cached_at', { type: Sequelize.DATE, allowNull: true }]
    ];
    for (const [name, def] of cols) {
      if (!desc[name]) {
        await queryInterface.addColumn('tracks', name, def);
      }
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('tracks');
    for (const name of ['detail_cached_at', 'youtube_video_id', 'description_en', 'description', 'writers', 'release_date']) {
      if (desc[name]) {
        await queryInterface.removeColumn('tracks', name);
      }
    }
  }
};
