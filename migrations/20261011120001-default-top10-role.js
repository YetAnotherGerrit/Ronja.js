"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "top10Role",
                    value: null,
                    type: "discordRole",
                    category: "Top 10",
                    description:
                        "Role for the members in the voice column of the weekly, monthly and yearly top 10 postings, until that period's next posting. Leave empty to disable.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "top10Role" }, {});
    },
};
