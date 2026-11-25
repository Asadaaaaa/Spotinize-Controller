import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class GameHistory extends Model {}

GameHistory.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  gameId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  mode: {
    type: DataTypes.ENUM('SOLO', 'MULTIPLAYER'),
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  artistQuery: {
    type: DataTypes.STRING,
    allowNull: true
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  roundReached: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  totalRounds: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  correctCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  wrongCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  skippedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalThinkingTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'COMPLETED' // 'COMPLETED', 'LEFT', 'WINNER'
  },
  gameSubtype: {
    type: DataTypes.STRING(32),
    defaultValue: 'CLASSIC',
    allowNull: false
  },
  isOfficialEligible: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  perfectRun: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  xpEarned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  notesEarned: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  rpDelta: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'GameHistory',
  tableName: 'game_histories'
});

export default GameHistory;
