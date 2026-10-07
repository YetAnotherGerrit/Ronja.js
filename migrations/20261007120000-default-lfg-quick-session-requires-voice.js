"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "lfgQuickSessionRequiresVoice",
                    value: "false",
                    type: "boolean",
                    category: "Looking for Group",
                    description:
                        "Whether /lfg without a day or time (a quick session) requires its host to be in a voice channel (not the AFK channel). Without one, they can still create an event with a day or time.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "lfgQuickSessionRequiresVoice" }, {});
    },
};
