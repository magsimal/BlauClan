const { Sequelize } = require('sequelize');
const dialect = process.env.DB_DIALECT || 'postgres';
const isSqlite = dialect === 'sqlite';

const sequelize = new Sequelize(
  isSqlite
    ? {
        dialect: 'sqlite',
        storage: process.env.DB_STORAGE || 'database.sqlite',
      }
    : {
        database: process.env.DB_NAME || 'familytree',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        dialect: 'postgres',
      }
);

const Person = require('./person')(sequelize);
const Marriage = require('./marriage')(sequelize);
const Layout = require('./layout')(sequelize);

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

module.exports = { sequelize, Person, Marriage, Layout };
