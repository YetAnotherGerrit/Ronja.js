"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // Messages members posted in a game text channel on a day (see Top10.js).
    class ChannelMessages extends Model {}
    ChannelMessages.init(
        {
            channel: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            day: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            messages: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            sequelize,
            modelName: "ChannelMessages",
            tableName: "ChannelMessages",
            indexes: [{ unique: true, fields: ["channel", "day"] }],
        }
    );
    return ChannelMessages;
};
