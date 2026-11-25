import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class UserRankedProfile extends Model {}

UserRankedProfile.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  seasonId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  rp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  tier: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'UNRANKED'
  },
  placementGamesPlayed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  demotionShieldGames: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rankedGamesPlayed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  rankedWins: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  peakTier: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'UNRANKED'
  },
  peakRp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  sequelize,
  modelName: 'UserRankedProfile',
  tableName: 'user_ranked_profiles'
});

export default UserRankedProfile;
