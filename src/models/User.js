import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class User extends Model {}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  spotifyId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  spotifyConnected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  spotifyUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  gamesPlayed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bestScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  averageScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  winRate: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  fastestGuess: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  totalSongsGuessed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  favoriteCategory: {
    type: DataTypes.STRING,
    defaultValue: 'Global Trends'
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  favoriteSongTitle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favoriteSongArtist: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favoriteSongCover: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favoriteSongSpotifyId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favoriteSongPreviewUrl: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users'
});

export default User;
