"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // What admins chose with /topic for a game text channel (see
    // ChannelTopic.js): whether Ronja keeps its topic, and a message of their
    // own to put in front. Channels without a row get the topic as well.
    class ChannelTopic extends Model {}
    ChannelTopic.init(
        {
            channel: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            enabled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            customMessage: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
        },
        {
            sequelize,
            modelName: "ChannelTopic",
        }
    );
    return ChannelTopic;
};
