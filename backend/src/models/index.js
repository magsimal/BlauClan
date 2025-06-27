const { Sequelize } = require('sequelize');
const dialect = process.env.DB_DIALECT || 'postgres';
const isSqlite = dialect === 'sqlite';

const logging = process.env.SQL_DEBUG === 'true' ? (msg) => console.debug(msg) : false;

const sequelize = new Sequelize(
  isSqlite
    ? {
        dialect: 'sqlite',
        storage: process.env.DB_STORAGE || 'database.sqlite',
        logging,
      }
    : {
        database: process.env.DB_NAME || 'familytree',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        dialect: 'postgres',
        logging,
      }
);

const Person = require('./person')(sequelize);
const Marriage = require('./marriage')(sequelize);
const Layout = require('./layout')(sequelize);
const Score = require('./score')(sequelize);
const Setting = require('./setting')(sequelize);

Person.belongsTo(Person, { as: 'father', foreignKey: 'fatherId' });
Person.belongsTo(Person, { as: 'mother', foreignKey: 'motherId' });
Person.belongsToMany(Person, {
  through: Marriage,
  as: 'spouses',
  foreignKey: 'personId',
  otherKey: 'spouseId',
});
Person.belongsToMany(Person, {
  through: Marriage,
  as: 'spousesOf',
  foreignKey: 'spouseId',
  otherKey: 'personId',
});

module.exports = { sequelize, Person, Marriage, Layout, Score, Setting };
