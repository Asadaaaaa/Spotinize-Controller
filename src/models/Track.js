import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Track extends Model {}

Track.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  spotifyId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  artist: {
    type: DataTypes.STRING,
    allowNull: false
  },
  album: {
    type: DataTypes.STRING,
    allowNull: true
  },
  albumArt: {
    type: DataTypes.STRING,
    allowNull: true
  },
  previewUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  localAudioPath: {
    type: DataTypes.STRING,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  genre: {
    type: DataTypes.STRING,
    allowNull: true
  },
  releaseYear: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  yearlyHitId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  durationMs: {
    type: DataTypes.INTEGER,
    defaultValue: 30000
  },
  popularity: {
    type: DataTypes.INTEGER,
    defaultValue: 50
  },
  releaseDate: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  writers: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  descriptionEn: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  youtubeVideoId: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  detailCachedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Track',
  tableName: 'tracks'
});

export default Track;
