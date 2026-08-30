"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    class Game extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            Game.hasMany(models.GameStatus);
        }
    }
    Game.init(
        {
            name: {
                type: DataTypes.STRING,
                unique: true,
            },
            channel: {
                type: DataTypes.STRING,
                defaultValue: null,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: "Game",
        }
    );
    return Game;
};
