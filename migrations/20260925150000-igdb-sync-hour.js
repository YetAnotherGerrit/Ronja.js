"use strict";

const HOUR_DESCRIPTION =
    "Hour of the day (0-23, in the server's timezone) to match known games to IGDB in the background and keep their data up to date. Leave empty to turn the background sync off.";
const TIME_DESCRIPTION =
    "Time of day (HH:MM, in the server's timezone) to match known games to IGDB in the background and keep their data up to date. Leave empty to turn the background sync off.";

// Replaces one IGDB sync schedule setting with another, converting its value.
async function replaceSetting(queryInterface, Sequelize, from, to, convert) {
    const [existing] = await queryInterface.sequelize.query(
        `SELECT "value" FROM "Settings" WHERE "name" = :name`,
        { replacements: { name: from }, type: Sequelize.QueryTypes.SELECT }
    );
    await queryInterface.bulkDelete("Settings", { name: from }, {});
    await queryInterface.bulkInsert(
        "Settings",
        [
            {
                ...to,
                value: convert(existing?.value?.trim() || null),
                category: "IGDB",
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ],
        {}
    );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    // The sync is checked hourly instead of every minute, so its schedule
    // setting becomes a whole hour: igdbSyncTime "13:00" -> igdbSyncHour "13".
    async up(queryInterface, Sequelize) {
        await replaceSetting(
            queryInterface,
            Sequelize,
            "igdbSyncTime",
            { name: "igdbSyncHour", type: "hour", description: HOUR_DESCRIPTION },
            (time) => {
                let hour = /^([01]?\d|2[0-3]):[0-5]\d$/.exec(time ?? "");
                return hour ? String(Number(hour[1])) : null;
            }
        );
    },

    async down(queryInterface, Sequelize) {
        await replaceSetting(
            queryInterface,
            Sequelize,
            "igdbSyncHour",
            { name: "igdbSyncTime", type: "time", description: TIME_DESCRIPTION },
            (hour) => (/^\d{1,2}$/.test(hour ?? "") ? `${hour.padStart(2, "0")}:00` : null)
        );
    },
};
