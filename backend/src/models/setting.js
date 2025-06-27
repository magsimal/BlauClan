const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Setting extends Model {}
  Setting.init(
    {
      username: { type: DataTypes.STRING, primaryKey: true },
      theme: { type: DataTypes.STRING, allowNull: false, defaultValue: 'light' },
      language: { type: DataTypes.STRING, allowNull: false, defaultValue: 'EN' },
      meNodeId: { type: DataTypes.INTEGER, allowNull: true },
    },
    { sequelize, modelName: 'Setting' },
  );
  return Setting;
};
