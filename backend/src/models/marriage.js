const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Marriage extends Model {}
  Marriage.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      personId: { type: DataTypes.INTEGER, allowNull: false },
      spouseId: { type: DataTypes.INTEGER, allowNull: false },
      dateOfMarriage: DataTypes.DATEONLY,
    },
    { sequelize, modelName: 'Marriage' }
  );
  return Marriage;
};
