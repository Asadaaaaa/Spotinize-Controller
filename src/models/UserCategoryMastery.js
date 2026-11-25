import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class UserCategoryMastery extends Model {}

UserCategoryMastery.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  xp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  tier: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'NONE'
  },
  correctSongs: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  gamesPlayed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  sequelize,
  modelName: 'UserCategoryMastery',
  tableName: 'user_category_masteries'
});

export default UserCategoryMastery;
