"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // The game server set up in a game text channel and its last known
        // status, for /gameserver (see ronja_modules/GameServer.js).
        await queryInterface.createTable("GameServers", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            channel: {
                allowNull: false,
                unique: true,
                type: Sequelize.STRING,
            },
            type: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            host: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            port: {
                allowNull: false,
                type: Sequelize.INTEGER,
            },
            connectAddress: {
                allowNull: true,
                type: Sequelize.STRING,
            },
            online: {
                allowNull: true,
                type: Sequelize.BOOLEAN,
            },
            failures: {
                allowNull: false,
                defaultValue: 0,
                type: Sequelize.INTEGER,
            },
            players: {
                allowNull: true,
                type: Sequelize.INTEGER,
            },
            maxPlayers: {
                allowNull: true,
                type: Sequelize.INTEGER,
            },
            checkedAt: {
                allowNull: true,
                type: Sequelize.DATE,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("GameServers");
    },
};
