"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "igdbSyncTime",
                    value: null,
                    type: "time",
                    category: "IGDB",
                    description:
                        "Time of day (HH:MM, in the server's timezone) to match known games to IGDB in the background and keep their data up to date. Leave empty to turn the background sync off.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "igdbSyncTime" }, {});
    },
};
