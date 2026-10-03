"use strict";

// The top10HideNumbers setting, split into one per /top10 column.
const COLUMNS = [
    {
        name: "top10HideGamePlayers",
        description:
            "Whether the top 10 hides how many members played each game. The ranking stays the same.",
    },
    {
        name: "top10HideVoiceTime",
        description:
            "Whether the top 10 hides each member's time in voice channels. The ranking stays the same.",
    },
    {
        name: "top10HideChannelMessages",
        description:
            "Whether the top 10 hides how many messages were written in each game channel. The ranking stays the same.",
    },
];
const OLD = {
    name: "top10HideNumbers",
    description:
        "Whether the top 10 hides its numbers (players, time in voice, messages). The ranking stays the same.",
};

async function values(queryInterface, Sequelize, names) {
    const rows = await queryInterface.sequelize.query(
        `SELECT "name", "value" FROM "Settings" WHERE "name" IN (:names)`,
        { replacements: { names }, type: Sequelize.QueryTypes.SELECT }
    );
    return rows.map((row) => row.value);
}

function settingRow({ name, description }, value) {
    return {
        name,
        value,
        type: "boolean",
        category: "Top 10",
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    // Every column keeps what the old setting said, so nothing changes for
    // admins who already hid the numbers.
    async up(queryInterface, Sequelize) {
        const [old] = await values(queryInterface, Sequelize, [OLD.name]);
        await queryInterface.bulkInsert(
            "Settings",
            COLUMNS.map((column) => settingRow(column, old === "true" ? "true" : "false")),
            {}
        );
        await queryInterface.bulkDelete("Settings", { name: OLD.name }, {});
    },

    // Numbers hidden in any column stay hidden.
    async down(queryInterface, Sequelize) {
        const names = COLUMNS.map((column) => column.name);
        const hidden = (await values(queryInterface, Sequelize, names)).includes("true");
        await queryInterface.bulkInsert("Settings", [settingRow(OLD, String(hidden))], {});
        await queryInterface.bulkDelete("Settings", { name: names }, {});
    },
};
