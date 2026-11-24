import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class BlindDropAttempt extends Model {}

BlindDropAttempt.init({
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
  solved: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  gaveUp: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  revealLevel: {
    type: DataTypes.FLOAT,
    defaultValue: 0.5,
    allowNull: false
  },
  attemptsUsed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'BlindDropAttempt',
  tableName: 'blind_drop_attempts',
  indexes: [
    {
      unique: true,
      fields: ['post_id', 'user_id']
    }
  ]
});

export default BlindDropAttempt;
