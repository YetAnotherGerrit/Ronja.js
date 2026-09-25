"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Messages members posted in a game text channel per day (in the
        // configured timezone), for /top10 (see ronja_modules/Top10.js).
        await queryInterface.createTable("ChannelMessages", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            channel: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            day: {
                allowNull: false,
                type: Sequelize.DATEONLY,
            },
            messages: {
                allowNull: false,
                defaultValue: 0,
                type: Sequelize.INTEGER,
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
        await queryInterface.addIndex("ChannelMessages", ["channel", "day"], { unique: true });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("ChannelMessages");
    },
};
