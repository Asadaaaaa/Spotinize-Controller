import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CosmeticItem extends Model {}

CosmeticItem.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(280),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  rarity: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'COMMON'
  },
  source: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'store'
  },
  isStoreAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  isGachaAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  priceNotes: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  visualConfig: {
    type: DataTypes.JSON,
    allowNull: true
  },
  originTag: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  createdWeekKey: {
    type: DataTypes.STRING(16),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  sequelize,
  modelName: 'CosmeticItem',
  tableName: 'cosmetic_items'
});

export default CosmeticItem;
