import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class GameRound extends Model {}

GameRound.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  gameId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  roundNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  trackId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'ACTIVE', 'FINISHED'),
    defaultValue: 'PENDING'
  }
}, {
  sequelize,
  modelName: 'GameRound',
  tableName: 'game_rounds'
});

export default GameRound;
