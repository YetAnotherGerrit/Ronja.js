"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // SQLite can't add a UNIQUE column via ALTER TABLE ADD COLUMN - add it
        // plain, then enforce uniqueness with a separate index.
        await queryInterface.addColumn("Games", "igdbId", {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null,
        });
        await queryInterface.addIndex("Games", ["igdbId"], {
            unique: true,
            name: "games_igdb_id_unique",
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex("Games", "games_igdb_id_unique");
        // SQLite rebuilds the table to drop a column, which trips FK
        // enforcement against GameStatuses.gameId unless briefly disabled.
        await queryInterface.sequelize.query("PRAGMA foreign_keys = OFF;");
        try {
            await queryInterface.removeColumn("Games", "igdbId");
        } finally {
            await queryInterface.sequelize.query("PRAGMA foreign_keys = ON;");
        }
    },
};
