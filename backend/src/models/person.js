const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Person extends Model {}
  Person.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      maidenName: DataTypes.STRING,
      gender: DataTypes.STRING,
      dateOfBirth: DataTypes.DATEONLY,
      dateOfDeath: DataTypes.DATEONLY,
      placeOfBirth: DataTypes.STRING,
      notes: DataTypes.TEXT,
      avatarUrl: DataTypes.STRING,
      fatherId: { type: DataTypes.INTEGER, allowNull: true },
      motherId: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, modelName: 'Person' }
  );
  return Person;
};
