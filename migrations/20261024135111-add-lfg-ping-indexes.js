"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // /lfg looks these up before its reply, which Discord only waits 3 seconds
        // for (see createChannelMemberPing in ronja_modules/Zocken.js). Without indexes,
        // each lookup scans the whole table. Per-member game lists (Serverprofile,
        // /gameinfo's guild info) use the GameStatuses one, too.
        await queryInterface.addIndex("GameStatuses", ["member", "lastplayed"], {
            name: "game_statuses_member_lastplayed",
        });
        await queryInterface.addIndex("MemberSettings", ["memberid", "name"], {
            name: "member_settings_memberid_name",
        });
        await queryInterface.addIndex("Games", ["channel"], {
            name: "games_channel",
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeIndex("Games", "games_channel");
        await queryInterface.removeIndex("MemberSettings", "member_settings_memberid_name");
        await queryInterface.removeIndex("GameStatuses", "game_statuses_member_lastplayed");
    },
};
