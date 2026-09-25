"use strict";

// The first migration named GameStatuses' foreign key to Games "gameId",
// while the model (GameStatus.belongsTo(Game)) and all code use "GameId".
// SQLite ignores the case in queries, but returns a column under its declared
// name, so status.GameId was undefined on every migrated database.
//
// SQLite's own RENAME COLUMN keeps the data, the foreign key and anything
// referring to the column. Databases that already have "GameId" are skipped.
async function renameColumn(queryInterface, from, to) {
    let columns = await queryInterface.describeTable("GameStatuses");
    if (!(from in columns)) return;
    await queryInterface.sequelize.query(
        `ALTER TABLE "GameStatuses" RENAME COLUMN "${from}" TO "${to}";`
    );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface) {
        await renameColumn(queryInterface, "gameId", "GameId");
    },

    async down(queryInterface) {
        await renameColumn(queryInterface, "GameId", "gameId");
    },
};
