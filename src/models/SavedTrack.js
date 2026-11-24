import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class SavedTrack extends Model {}

SavedTrack.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  trackId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  artist: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  coverUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  previewUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  spotifyId: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  trackKey: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  sourcePostId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'SavedTrack',
  tableName: 'saved_tracks',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'track_key']
    }
  ]
});

export default SavedTrack;
