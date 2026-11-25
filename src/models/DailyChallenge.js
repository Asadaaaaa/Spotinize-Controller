import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class DailyChallenge extends Model {}

DailyChallenge.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  dailyDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    unique: true
  },
  dailyNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  trackIdsJson: {
    type: DataTypes.JSON,
    allowNull: false
  },
  poolSummary: {
    type: DataTypes.JSON,
    allowNull: true
  },
  announcementPostId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  recapPosted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'DailyChallenge',
  tableName: 'daily_challenges'
});

export default DailyChallenge;
