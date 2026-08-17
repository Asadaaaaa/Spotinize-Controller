import { Track } from '../models/index.js';
import { Op } from 'sequelize';

export class TrackRepository {
  async findById(id) {
    return await Track.findByPk(id);
  }

  async findBySpotifyId(spotifyId) {
    return await Track.findOne({ where: { spotifyId } });
  }

  async create(trackData) {
    return await Track.create(trackData);
  }

  async upsert(trackData) {
    if (trackData.spotifyId) {
      const existing = await this.findBySpotifyId(trackData.spotifyId);
      if (existing) {
        return await existing.update(trackData);
      }
    }
    return await Track.create(trackData);
  }

  async bulkUpsert(tracks) {
    const results = [];
    for (const t of tracks) {
      results.push(await this.upsert(t));
    }
    return results;
  }

  async findByCategory(category, excludeIds = [], limit = 20) {
    const where = {};
    if (category) {
      where.category = category;
    }
    if (excludeIds && excludeIds.length > 0) {
      where.id = { [Op.notIn]: excludeIds };
    }

    return await Track.findAll({
      where,
      limit,
      order: sequelize => sequelize.random()
    });
  }

  async findByArtist(artistQuery, excludeIds = [], limit = 20) {
    const where = {
      artist: { [Op.like]: `%${artistQuery}%` }
    };
    if (excludeIds && excludeIds.length > 0) {
      where.id = { [Op.notIn]: excludeIds };
    }

    return await Track.findAll({
      where,
      limit,
      order: sequelize => sequelize.random()
    });
  }

  async searchTracks(query, limit = 15) {
    if (!query) return [];
    return await Track.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.like]: `%${query}%` } },
          { artist: { [Op.like]: `%${query}%` } }
        ]
      },
      limit
    });
  }
}

export const trackRepository = new TrackRepository();
export default trackRepository;
