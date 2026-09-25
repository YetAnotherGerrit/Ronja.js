"use strict";

const GUILD_DETAILS = ["players", "channel"];
const DESCRIPTION =
    "Which details the IGDB game card shows: pinned in new game text channels, in their notifications and in /gameinfo. Players and text channel are only shown in /gameinfo.";
const OLD_DESCRIPTION =
    "Which details the IGDB game card shows: pinned in new game text channels, in their notifications and in /gameinfo.";

// Rewrites the gameCardDetails setting (a comma-separated list, see DETAILS
// in core/gameCard.js) with `change` applied to its picked details.
async function updateSetting(queryInterface, Sequelize, change, description) {
    const [setting] = await queryInterface.sequelize.query(
        `SELECT "value" FROM "Settings" WHERE "name" = 'gameCardDetails'`,
        { type: Sequelize.QueryTypes.SELECT }
    );
    if (!setting) return;
    let picked = (setting.value || "").split(",").filter(Boolean);
    // Not bulkUpdate: on SQLite it stores the Date as an epoch number, which
    // Sequelize then can't read back. A replacement is written as a date string.
    await queryInterface.sequelize.query(
        `UPDATE "Settings" SET "value" = :value, "description" = :description, "updatedAt" = :now
        WHERE "name" = 'gameCardDetails'`,
        { replacements: { value: change(picked).join(","), description, now: new Date() } }
    );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    // The card's new guild details (who played it recently, its text
    // channel) are on by default, also where the admin already picked details.
    async up(queryInterface, Sequelize) {
        await updateSetting(
            queryInterface,
            Sequelize,
            (picked) => [...picked, ...GUILD_DETAILS.filter((d) => !picked.includes(d))],
            DESCRIPTION
        );
    },

    async down(queryInterface, Sequelize) {
        await updateSetting(
            queryInterface,
            Sequelize,
            (picked) => picked.filter((d) => !GUILD_DETAILS.includes(d)),
            OLD_DESCRIPTION
        );
    },
};
