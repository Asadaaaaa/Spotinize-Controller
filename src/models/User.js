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
  },
  isOfficial: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  currentStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  longestStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  lastPlayedDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  notesBalance: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  gachaTickets: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  streakFreezes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  equippedFrameId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  equippedVinylId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  equippedTitleId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  gachaPityEpic: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  gachaPityLegendary: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  allTimePowerScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  officialGamesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  officialAvgScore: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
    allowNull: false
  },
  dailyPointsTotal: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users'
});

export default User;
