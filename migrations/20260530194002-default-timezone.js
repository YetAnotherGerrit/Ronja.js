"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "timezone",
                    type: "string",
                    description: "Default timezone for the server.",
                    value: "Europe/Berlin",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "timezone" }, {});
    },
};
