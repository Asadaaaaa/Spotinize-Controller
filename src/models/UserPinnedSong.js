import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class UserPinnedSong extends Model {}

UserPinnedSong.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
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
  }
}, {
  sequelize,
  modelName: 'UserPinnedSong',
  tableName: 'user_pinned_songs'
});

export default UserPinnedSong;
