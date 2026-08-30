"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "top10CronChannel",
                    value: null,
                    type: "discordChannel",
                    description: "Channel for automatic top 10 messages. Leave empty to disable.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "top10Weekly",
                    value: "true",
                    type: "boolean",
                    description:
                        "Whether to post the top 10 weekly. Requires top10CronChannel to be set.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "top10Monthly",
                    value: "true",
                    type: "boolean",
                    description:
                        "Whether to post the top 10 monthly. Requires top10CronChannel to be set.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "top10Yearly",
                    value: "true",
                    type: "boolean",
                    description:
                        "Whether to post the top 10 yearly. Requires top10CronChannel to be set.",
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
                name: ["top10CronChannel", "top10Weekly", "top10Monthly", "top10Yearly"],
            },
            {}
        );
    },
};
