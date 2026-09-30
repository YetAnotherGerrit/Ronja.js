"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "buttonEmojis",
                    value: "true",
                    type: "boolean",
                    category: "General",
                    description: "Whether Ronja's buttons show an emoji in front of their label.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "buttonEmojis" }, {});
    },
};
