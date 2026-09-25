"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "gameCardDetails",
                    // Everything the card can show (see DETAILS in core/gameCard.js).
                    value: "cover,summary,releaseDate,platforms,rating,genres,timeToBeat,multiplayer,links",
                    type: "multiselect",
                    category: "IGDB",
                    description:
                        "Which details the IGDB game card shows: pinned in new game text channels, in their notifications and in /gameinfo.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete("Settings", { name: "gameCardDetails" }, {});
    },
};
