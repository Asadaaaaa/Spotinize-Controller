import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Post extends Model {}

Post.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'note' // 'note' | 'blind_drop' | 'challenge' | 'auto_activity' | 'official_ai'
  },
  subtype: {
    type: DataTypes.STRING(40),
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contentEn: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sourceUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sourceName: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  trackId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  trackTitle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  trackArtist: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  trackCover: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  trackPreviewUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  trackSpotifyId: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  sourceGameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  metadataJson: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Post',
  tableName: 'posts'
});

export default Post;
