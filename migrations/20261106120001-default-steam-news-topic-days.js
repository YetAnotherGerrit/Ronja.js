"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "steamNewsTopicDays",
                    value: "14",
                    type: "integer",
                    category: "Dynamic Text Channels",
                    description:
                        "A game text channel's topic shows the game's latest Steam news only if it's at most this many days old. 0 never shows Steam news there.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "steamNewsTopicDays" }, {});
    },
};
