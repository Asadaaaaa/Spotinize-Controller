import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class DailyAttempt extends Model {}

DailyAttempt.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  dailyDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  gameId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  correctCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  totalThinkingTime: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0
  },
  emojiGrid: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'IN_PROGRESS'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'DailyAttempt',
  tableName: 'daily_attempts'
});

export default DailyAttempt;
