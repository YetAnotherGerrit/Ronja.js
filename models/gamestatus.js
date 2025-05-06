"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    class GameStatus extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            GameStatus.belongsTo(models.Game);
        }
    }
    GameStatus.init(
        {
            member: DataTypes.STRING,
            lastplayed: DataTypes.DATE,
        },
        {
            sequelize,
            modelName: "GameStatus",
        }
    );
    return GameStatus;
};
