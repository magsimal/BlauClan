const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Layout extends Model {}
  Layout.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      data: { type: DataTypes.JSON, allowNull: false },
    },
    { sequelize, modelName: 'Layout' }
  );
  return Layout;
};
