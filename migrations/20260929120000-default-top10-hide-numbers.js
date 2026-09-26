"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "top10HideNumbers",
                    value: "false",
                    type: "boolean",
                    category: "Top 10",
                    description:
                        "Whether the top 10 hides its numbers (players, time in voice, messages). The ranking stays the same.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "top10HideNumbers" }, {});
    },
};
