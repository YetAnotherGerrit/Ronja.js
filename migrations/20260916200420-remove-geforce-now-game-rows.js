"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const games = await queryInterface.sequelize.query(
            `SELECT "id" FROM "Games" WHERE "name" = :name`,
            {
                replacements: { name: "GeForce NOW" },
                type: Sequelize.QueryTypes.SELECT,
            }
        );
        const gameIds = games.map((g) => g.id);

        if (gameIds.length > 0) {
            await queryInterface.bulkDelete("GameStatuses", { gameId: gameIds }, {});
            await queryInterface.bulkDelete("Games", { id: gameIds }, {});
        }
    },

    async down(queryInterface, Sequelize) {
        // Not reversible: the deleted "GeForce NOW" rows never held the real
        // game names, so there is nothing meaningful to restore.
    },
};
