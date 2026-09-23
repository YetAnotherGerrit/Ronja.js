"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "igdbClientId",
                    value: null,
                    type: "string",
                    category: "IGDB",
                    description:
                        "Twitch/IGDB client ID. Leave empty to disable IGDB game resolution and /gameinfo.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "igdbClientSecret",
                    value: null,
                    type: "string",
                    category: "IGDB",
                    description:
                        "Twitch/IGDB client secret. Leave empty to disable IGDB game resolution and /gameinfo.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete(
            "Settings",
            {
                name: ["igdbClientId", "igdbClientSecret"],
            },
            {}
        );
    },
};
