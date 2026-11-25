import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class GamePlayer extends Model {}

GamePlayer.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  gameId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  currentRound: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  currentRevealLevel: {
    type: DataTypes.FLOAT,
    defaultValue: 0.1
  },
  remainingAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  totalThinkingTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  },
  roundThinkingTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  },
  roundStartedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('THINKING', 'GUESSED', 'WRONG', 'SKIPPED', 'LEFT'),
    defaultValue: 'THINKING'
  },
  connectionStatus: {
    type: DataTypes.ENUM('CONNECTED', 'DISCONNECTED'),
    defaultValue: 'CONNECTED'
  },
  disconnectedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isHost: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isReady: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  lives: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
    allowNull: false
  },
  isEliminated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  teamId: {
    type: DataTypes.STRING(16),
    allowNull: true
  },
  buzzLockoutUntil: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'GamePlayer',
  tableName: 'game_players'
});

export default GamePlayer;
