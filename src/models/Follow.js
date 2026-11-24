import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Follow extends Model {}

Follow.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  followerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  followingId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'Follow',
  tableName: 'follows',
  indexes: [
    {
      unique: true,
      fields: ['follower_id', 'following_id']
    }
  ]
});

export default Follow;
