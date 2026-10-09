"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "gameServerPostDays",
                    value: "7",
                    type: "integer",
                    category: "Game Servers",
                    description:
                        "Ronja only posts in a game text channel that its game server went offline or came back online if someone played the game within this many days. The channel topic shows the status either way.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "gameServerPostDays" }, {});
    },
};
