import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Game extends Model {}

Game.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  roomCode: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  mode: {
    type: DataTypes.ENUM('SOLO', 'MULTIPLAYER'),
    defaultValue: 'SOLO',
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'Global Trends',
    allowNull: false
  },
  artistQuery: {
    type: DataTypes.STRING,
    allowNull: true
  },
  numberOfSongs: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    allowNull: false
  },
  currentRound: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  status: {
    type: DataTypes.ENUM('WAITING', 'STARTING', 'PLAYING', 'FINISHED', 'ABANDONED'),
    defaultValue: 'WAITING',
    allowNull: false
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 8,
    allowNull: false
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  challengePostId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gameSubtype: {
    type: DataTypes.STRING(32),
    defaultValue: 'CLASSIC',
    allowNull: false
  },
  dailyDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  seasonId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  rankedDuelId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Game',
  tableName: 'games'
});

export default Game;
