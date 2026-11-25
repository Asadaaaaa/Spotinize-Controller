import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class UserItem extends Model {}

UserItem.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  itemId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  acquiredVia: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'store'
  },
  acquiredAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'UserItem',
  tableName: 'user_items'
});

export default UserItem;
