const { DataTypes, Model } = require('sequelize');
const sequelize = require('./index');

class Person extends Model {}

Person.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    gender: DataTypes.STRING,
    dateOfBirth: DataTypes.DATEONLY,
    dateOfDeath: DataTypes.DATEONLY,
    placeOfBirth: DataTypes.STRING,
    fatherId: { type: DataTypes.INTEGER, allowNull: true },
    motherId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { sequelize, modelName: 'Person' }
);

Person.belongsTo(Person, { as: 'father', foreignKey: 'fatherId' });
Person.belongsTo(Person, { as: 'mother', foreignKey: 'motherId' });

module.exports = Person;
