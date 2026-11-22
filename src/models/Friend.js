import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Friend extends Model {}

Friend.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'user_id'
    },
    friendId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'friend_id'
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'PENDING'
    }
  },
  {
    sequelize,
    tableName: 'friends',
    underscored: true,
    timestamps: true
  }
);

export default Friend;
