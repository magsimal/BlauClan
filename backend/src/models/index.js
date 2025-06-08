const { Sequelize } = require('sequelize');

const dialect = process.env.DB_DIALECT || 'postgres';
const isSqlite = dialect === 'sqlite';

const sequelize = new Sequelize(
  isSqlite ? {
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || 'database.sqlite'
  } :
  {
    database: process.env.DB_NAME || 'familytree',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres',
  }
);

module.exports = sequelize;
