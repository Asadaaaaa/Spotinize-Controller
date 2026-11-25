import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class RankedDuel extends Model {}

RankedDuel.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  seasonId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  challengerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  opponentId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sourceGameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  challengerGameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  opponentGameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  challengerScore: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  opponentScore: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  winnerId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'RankedDuel',
  tableName: 'ranked_duels'
});

export default RankedDuel;
