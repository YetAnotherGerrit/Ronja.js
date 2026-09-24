"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Background IGDB sync state per game (see ronja_modules/IGDB.js):
        // - igdbStatus: null (unchecked, or matched and fine), "notFound",
        //   "pending" (waiting for the guild owner), "declined" or "gone"
        //   (matched, but no longer on IGDB).
        // - igdbCheckedAt: last IGDB check, drives retries and the refresh order.
        // - igdbSyncedFields: the synced columns this row was last filled with.
        await queryInterface.addColumn("Games", "igdbStatus", {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null,
        });
        await queryInterface.addColumn("Games", "igdbCheckedAt", {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
        });
        await queryInterface.addColumn("Games", "igdbSyncedFields", {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null,
        });
    },

    async down(queryInterface, Sequelize) {
        // SQLite rebuilds the table to drop a column, which trips FK
        // enforcement against GameStatuses.gameId unless briefly disabled.
        await queryInterface.sequelize.query("PRAGMA foreign_keys = OFF;");
        try {
            await queryInterface.removeColumn("Games", "igdbSyncedFields");
            await queryInterface.removeColumn("Games", "igdbCheckedAt");
            await queryInterface.removeColumn("Games", "igdbStatus");
        } finally {
            await queryInterface.sequelize.query("PRAGMA foreign_keys = ON;");
        }
    },
};
