import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class AiContentLog extends Model {}

AiContentLog.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  topicHash: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true
  },
  category: {
    type: DataTypes.STRING(40),
    allowNull: false
  },
  rawSource: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  postId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'PUBLISHED'
  }
}, {
  sequelize,
  modelName: 'AiContentLog',
  tableName: 'ai_content_logs'
});

export default AiContentLog;
