import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PostReaction extends Model {}

PostReaction.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  postId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  emoji: {
    type: DataTypes.STRING(16),
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'PostReaction',
  tableName: 'post_reactions',
  indexes: [
    {
      unique: true,
      fields: ['post_id', 'user_id', 'emoji']
    }
  ]
});

export default PostReaction;
