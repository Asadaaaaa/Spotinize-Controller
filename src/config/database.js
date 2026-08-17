import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
const dbUser = process.env.DB_USERNAME || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'spotinize';

export class Database {
  constructor() {
    this.sequelize = new Sequelize(dbName, dbUser, dbPassword, {
      host: dbHost,
      port: dbPort,
      dialect: 'mysql',
      logging: false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true
      }
    });
  }

  async connect() {
    try {
      await this.sequelize.authenticate();
      console.log(`📦 MySQL Database [${dbName}] connected successfully at ${dbHost}:${dbPort}.`);
    } catch (error) {
      console.error('❌ Unable to connect to the MySQL database:', error);
      throw error;
    }
  }

  async sync(options = {}) {
    try {
      await this.sequelize.sync(options);
      console.log('✅ MySQL Database models synchronized.');
    } catch (error) {
      console.error('❌ Database sync failed:', error);
      throw error;
    }
  }

  getInstance() {
    return this.sequelize;
  }
}

export const database = new Database();
export const sequelize = database.getInstance();
export default database;
