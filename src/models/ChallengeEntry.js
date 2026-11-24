import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class ChallengeEntry extends Model {}

ChallengeEntry.init({
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
  gameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  thinkingTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'ChallengeEntry',
  tableName: 'challenge_entries',
  indexes: [
    {
      unique: true,
      fields: ['post_id', 'user_id']
    }
  ]
});

export default ChallengeEntry;
