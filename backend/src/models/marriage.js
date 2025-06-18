const { DataTypes, Model } = require('sequelize');
module.exports = (sequelize) => {
  class Marriage extends Model {}
  Marriage.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      personId: { type: DataTypes.INTEGER, allowNull: false },
      spouseId: { type: DataTypes.INTEGER, allowNull: false },
      dateOfMarriage: DataTypes.DATEONLY,
      marriageApprox: DataTypes.STRING,
      placeOfMarriage: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'Marriage',
      indexes: [
        {
          unique: true,
          fields: ['personId', 'spouseId'],
        },
      ],
    }
  );
  return Marriage;
};
