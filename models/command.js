"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    class Command extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
        }
    }
    Command.init(
        {
            name: DataTypes.STRING,
            type: DataTypes.INTEGER,
            discordId: DataTypes.STRING,
            hash: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "Command",
        }
    );
    return Command;
};
