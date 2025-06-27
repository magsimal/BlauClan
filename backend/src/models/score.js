const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Score extends Model {}
  Score.init(
    {
      username: { type: DataTypes.STRING, primaryKey: true },
      points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { sequelize, modelName: 'Score' }
  );
  return Score;
};
