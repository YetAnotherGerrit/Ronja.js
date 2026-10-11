"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // A member Ronja gave the top10Role to for being in a top 10 posting of
    // `period` (weekly, monthly or yearly) - see Top10.js.
    class Top10RoleMember extends Model {}
    Top10RoleMember.init(
        {
            period: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            member: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            sequelize,
            modelName: "Top10RoleMember",
            indexes: [{ unique: true, fields: ["period", "member"] }],
        }
    );
    return Top10RoleMember;
};
