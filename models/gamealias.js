"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // Another name a Game row is known under, e.g. the activity name it was
    // matched from, or the name of a duplicate merged into it (see IGDB.js).
    class GameAlias extends Model {
        static associate(models) {
            GameAlias.belongsTo(models.Game, { onDelete: "CASCADE" });
        }
    }
    GameAlias.init(
        {
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
        },
        {
            sequelize,
            modelName: "GameAlias",
        }
    );
    return GameAlias;
};
