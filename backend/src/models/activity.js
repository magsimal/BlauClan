const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Activity extends Model {}
  Activity.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      username: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: false },
      points: { type: DataTypes.INTEGER, allowNull: false },
    },
    { sequelize, modelName: 'Activity' }
  );
  return Activity;
};
