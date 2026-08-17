import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Guess extends Model {}

Guess.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  gameId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  roundId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  guessedTitle: {
    type: DataTypes.STRING,
    allowNull: false
  },
  guessedArtist: {
    type: DataTypes.STRING,
    allowNull: false
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  attemptNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  revealLevel: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  thinkingTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  },
  pointsAwarded: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  sequelize,
  modelName: 'Guess',
  tableName: 'guesses'
});

export default Guess;
