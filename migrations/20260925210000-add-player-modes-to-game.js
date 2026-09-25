"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Per-game IGDB data for the multiplayer game lists (/lfg, the voice
        // channel status, Serverprofile), filled in by the IGDB sync (see
        // syncFields in ronja_modules/IGDB.js). Both are null while unknown:
        // - singlePlayerOnly: whether "Single player" is the game's only game mode.
        // - onlineMaxPlayers: the most players online (multiplayer or co-op) on any platform.
        await queryInterface.addColumn("Games", "singlePlayerOnly", {
            type: Sequelize.BOOLEAN,
            allowNull: true,
            defaultValue: null,
        });
        await queryInterface.addColumn("Games", "onlineMaxPlayers", {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null,
        });
    },

    async down(queryInterface, Sequelize) {
        // SQLite rebuilds the table to drop a column, which trips FK
        // enforcement against GameStatuses' foreign key to Games unless briefly disabled.
        await queryInterface.sequelize.query("PRAGMA foreign_keys = OFF;");
        try {
            await queryInterface.removeColumn("Games", "onlineMaxPlayers");
            await queryInterface.removeColumn("Games", "singlePlayerOnly");
        } finally {
            await queryInterface.sequelize.query("PRAGMA foreign_keys = ON;");
        }
    },
};
