"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Whether the guild owner was already asked if a game IGDB has no
        // results for is a game at all (see ronja_modules/IGDB.js). Kept apart
        // from igdbStatus, which moves on with later retries, so that question
        // is never asked twice. Existing not-found games start out unasked.
        await queryInterface.addColumn("Games", "igdbNotFoundAsked", {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        });
    },

    async down(queryInterface, Sequelize) {
        // SQLite rebuilds the table to drop a column, which trips FK
        // enforcement against GameStatuses' foreign key to Games unless briefly disabled.
        await queryInterface.sequelize.query("PRAGMA foreign_keys = OFF;");
        try {
            await queryInterface.removeColumn("Games", "igdbNotFoundAsked");
        } finally {
            await queryInterface.sequelize.query("PRAGMA foreign_keys = ON;");
        }
    },
};
