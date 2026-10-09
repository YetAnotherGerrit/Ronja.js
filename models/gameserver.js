"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
    // The game server set up in a game text channel and its last known status
    // (see GameServer.js). `online` is null until it was checked (again).
    class GameServer extends Model {}
    GameServer.init(
        {
            channel: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            type: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            host: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            port: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            connectAddress: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
            },
            online: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
                defaultValue: null,
            },
            failures: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            players: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: null,
            },
            maxPlayers: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: null,
            },
            checkedAt: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: null,
            },
        },
        {
            sequelize,
            modelName: "GameServer",
        }
    );
    return GameServer;
};
