import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class DailyLoginClaim extends Model {}

DailyLoginClaim.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  weekKey: {
    type: DataTypes.STRING(16),
    allowNull: false
  },
  dayNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  claimDateWib: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  rewardPayload: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'DailyLoginClaim',
  tableName: 'daily_login_claims'
});

export default DailyLoginClaim;
