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
            Game.hasMany(models.GameAlias, { onDelete: "CASCADE" });
        }
    }
    Game.init(
        {
            name: {
                type: DataTypes.STRING,
                unique: true,
            },
            igdbId: {
                type: DataTypes.STRING,
                unique: true,
                allowNull: true,
                defaultValue: null,
            },
            igdbStatus: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
            igdbCheckedAt: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
            },
            igdbSyncedFields: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
            igdbNotFoundAsked: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            singlePlayerOnly: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
                defaultValue: null,
            },
            onlineMaxPlayers: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: null,
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
