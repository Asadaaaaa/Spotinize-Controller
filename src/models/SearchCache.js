import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class SearchCache extends Model {}

SearchCache.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  query: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  results: {
    type: DataTypes.JSON,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  }
}, {
  sequelize,
  modelName: 'SearchCache',
  tableName: 'search_caches'
});

export default SearchCache;
