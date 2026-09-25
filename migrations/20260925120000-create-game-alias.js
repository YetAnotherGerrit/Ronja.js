"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Other names a Game row is known under (see ronja_modules/IGDB.js), e.g.
        // the activity name it was matched from or names merged into it, so a
        // renamed or merged game is still found by its old activity name.
        await queryInterface.createTable("GameAliases", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            name: {
                allowNull: false,
                unique: true,
                type: Sequelize.STRING,
            },
            GameId: {
                allowNull: false,
                type: Sequelize.INTEGER,
                references: {
                    model: "Games",
                    key: "id",
                },
                onDelete: "CASCADE",
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("GameAliases");
    },
};
