"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "dtcGamesCategory",
                    value: null,
                    type: "discordCategory",
                    description:
                        "Category for creating dynamic games channels. Leave empty to disable.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcArchivedGamesCategory",
                    value: null,
                    type: "discordCategory",
                    description:
                        "Category for archiving dynamic games channels. Leave empty to disable.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcNotificationChannel",
                    value: null,
                    type: "discordChannel",
                    description:
                        "Channel for notifications about dynamic games channels. Leave empty to disable.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcMinimumPlayersForCreation",
                    value: "3",
                    type: "integer",
                    description:
                        "Minimum number of players required to create a dynamicgames channel.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcDaysRelevantForCreation",
                    value: "30",
                    type: "integer",
                    description:
                        "Number of days to look back for game activity when creating channels.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcDaysToArchive",
                    value: "30",
                    type: "integer",
                    description:
                        "Number of days after which an inactive games channel should be archived.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "dtcDaysTarget",
                    value: "100",
                    type: "integer",
                    description:
                        "Number of days to look back for game activity when populating channels.",
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
                name: [
                    "dtcGamesCategory",
                    "dtcArchivedGamesCategory",
                    "dtcNotificationChannel",
                    "dtcMinimumPlayersForCreation",
                    "dtcDaysRelevantForCreation",
                    "dtcDaysToArchive",
                    "dtcDaysTarget",
                ],
            },
            {}
        );
    },
};
