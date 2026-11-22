import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class YearlyHit extends Model {}

YearlyHit.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'YearlyHit',
  tableName: 'yearly_hits'
});

export default YearlyHit;
