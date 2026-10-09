"use strict";

const DETAIL = "server";
const DESCRIPTION =
    "Which details the IGDB game card shows: pinned in new game text channels, in their notifications and in /gameinfo. Players, text channel and game server are only shown in /gameinfo.";
const OLD_DESCRIPTION =
    "Which details the IGDB game card shows: pinned in new game text channels, in their notifications and in /gameinfo. Players and text channel are only shown in /gameinfo.";

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
    // The card's game server status is on by default, also where the admin
    // already picked details.
    async up(queryInterface, Sequelize) {
        await updateSetting(
            queryInterface,
            Sequelize,
            (picked) => (picked.includes(DETAIL) ? picked : [...picked, DETAIL]),
            DESCRIPTION
        );
    },

    async down(queryInterface, Sequelize) {
        await updateSetting(
            queryInterface,
            Sequelize,
            (picked) => picked.filter((d) => d !== DETAIL),
            OLD_DESCRIPTION
        );
    },
};
