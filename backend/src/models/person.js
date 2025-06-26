const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Person extends Model {}
  Person.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      firstName: DataTypes.STRING,
      callName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      maidenName: DataTypes.STRING,
      gender: DataTypes.STRING,
      dateOfBirth: DataTypes.DATEONLY,
      dateOfDeath: DataTypes.DATEONLY,
      birthApprox: DataTypes.STRING,
      deathApprox: DataTypes.STRING,
      placeOfBirth: DataTypes.STRING,
      geonameId: DataTypes.INTEGER,
      notes: DataTypes.TEXT,
      avatarUrl: DataTypes.STRING,
      gedcomId: DataTypes.STRING,
      fatherId: { type: DataTypes.INTEGER, allowNull: true },
      motherId: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, modelName: 'Person' }
  );
  return Person;
};
