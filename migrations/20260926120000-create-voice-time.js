"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Seconds a member spent in voice channels per day (in the configured
        // timezone), for /top10 (see ronja_modules/Top10.js).
        await queryInterface.createTable("VoiceTimes", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            member: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            day: {
                allowNull: false,
                type: Sequelize.DATEONLY,
            },
            seconds: {
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
        await queryInterface.addIndex("VoiceTimes", ["member", "day"], { unique: true });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("VoiceTimes");
    },
};
