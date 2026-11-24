import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PostComment extends Model {}

PostComment.init({
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
  content: {
    type: DataTypes.STRING(500),
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'PostComment',
  tableName: 'post_comments'
});

export default PostComment;
