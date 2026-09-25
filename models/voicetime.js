"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // Seconds a member spent in voice channels on a day (see Top10.js).
    class VoiceTime extends Model {}
    VoiceTime.init(
        {
            member: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            day: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            seconds: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            sequelize,
            modelName: "VoiceTime",
            indexes: [{ unique: true, fields: ["member", "day"] }],
        }
    );
    return VoiceTime;
};
