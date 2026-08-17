import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class RecentlyPlayed extends Model {}

RecentlyPlayed.init({
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
    allowNull: false
  },
  trackTitle: {
    type: DataTypes.STRING,
    allowNull: false
  },
  artistName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  gameMode: {
    type: DataTypes.ENUM('SOLO', 'MULTIPLAYER'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  playedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'RecentlyPlayed',
  tableName: 'recently_played'
});

export default RecentlyPlayed;
