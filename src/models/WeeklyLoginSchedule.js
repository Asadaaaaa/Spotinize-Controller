import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class WeeklyLoginSchedule extends Model {}

WeeklyLoginSchedule.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  weekKey: {
    type: DataTypes.STRING(16),
    allowNull: false,
    unique: true
  },
  themeTitle: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  themeSubtitle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  generatedByAi: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  daysJson: {
    type: DataTypes.JSON,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'WeeklyLoginSchedule',
  tableName: 'weekly_login_schedules'
});

export default WeeklyLoginSchedule;
