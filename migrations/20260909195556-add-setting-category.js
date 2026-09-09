"use strict";

const CATEGORIES = {
    "Dynamic Text Channels": [
        "dtcGamesCategory",
        "dtcArchivedGamesCategory",
        "dtcNotificationChannel",
        "dtcMinimumPlayersForCreation",
        "dtcDaysRelevantForCreation",
        "dtcDaysToArchive",
        "dtcDaysTarget",
    ],
    "ical Feed": ["icalFtpServer", "icalFtpPort", "icalFtpUsername", "icalFtpPassword", "icalUrl"],
    General: ["timezone", "voiceChannelBitrate"],
    "Top 10": ["top10CronChannel", "top10Weekly", "top10Monthly", "top10Yearly"],
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("Settings", "category", {
            type: Sequelize.STRING,
        });

        for (let [category, names] of Object.entries(CATEGORIES)) {
            await queryInterface.bulkUpdate("Settings", { category }, { name: names });
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("Settings", "category");
    },
};
