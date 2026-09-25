"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // The game's IGDB genre names as a sorted JSON array (e.g.
        // '["Adventure","Shooter"]') for the Serverprofile's favorite genres,
        // filled in by the IGDB sync (see syncFields in ronja_modules/IGDB.js).
        // Null while unknown.
        await queryInterface.addColumn("Games", "genres", {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: null,
        });
    },

    async down(queryInterface) {
        // SQLite rebuilds the table to drop a column, which trips FK
        // enforcement against GameStatuses' foreign key to Games unless briefly disabled.
        await queryInterface.sequelize.query("PRAGMA foreign_keys = OFF;");
        try {
            await queryInterface.removeColumn("Games", "genres");
        } finally {
            await queryInterface.sequelize.query("PRAGMA foreign_keys = ON;");
        }
    },
};
