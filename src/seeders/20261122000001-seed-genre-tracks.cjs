'use strict';

const crypto = require('crypto');

module.exports = {
  async up(queryInterface) {
    const { GENRE_FALLBACK_CATALOG } = await import('../data/genreFallbackCatalog.js');
    const now = new Date();

    const rows = GENRE_FALLBACK_CATALOG.map((t) => ({
      id: crypto.randomUUID(),
      spotify_id: t.spotifyId,
      title: t.title,
      artist: t.artist,
      album: t.album || t.title,
      category: 'Genre',
      genre: t.subCategory,
      release_year: t.releaseYear || null,
      duration_ms: 30000,
      popularity: 75,
      created_at: now,
      updated_at: now
    }));

    // Insert in batches of 200, skipping existing spotify_id rows
    const batchSize = 200;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await queryInterface.bulkInsert('tracks', batch, {
        ignoreDuplicates: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('tracks', {
      spotify_id: { [Sequelize.Op.like]: 'fb_%' }
    });
  }
};
