import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class UserQuest extends Model {}

UserQuest.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  questType: {
    type: DataTypes.STRING(16),
    allowNull: false
  },
  periodKey: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  questCode: {
    type: DataTypes.STRING(48),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(160),
    allowNull: false
  },
  targetValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  progressValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rewardNotes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rewardXp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rewardTickets: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'ACTIVE'
  }
}, {
  sequelize,
  modelName: 'UserQuest',
  tableName: 'user_quests'
});

export default UserQuest;
