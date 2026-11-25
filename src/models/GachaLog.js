import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class GachaLog extends Model {}

GachaLog.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  pullBatchId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  itemId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  rarity: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  wasDuplicate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  refundNotes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  costType: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'NOTES'
  },
  pityTriggered: {
    type: DataTypes.STRING(24),
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'GachaLog',
  tableName: 'gacha_logs'
});

export default GachaLog;
