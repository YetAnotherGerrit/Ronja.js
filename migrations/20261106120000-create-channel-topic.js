"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Per game text channel: whether Ronja keeps its topic, and the
        // admins' own message in it - see ronja_modules/ChannelTopic.js.
        await queryInterface.createTable("ChannelTopics", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            channel: {
                allowNull: false,
                unique: true,
                type: Sequelize.STRING,
            },
            enabled: {
                allowNull: false,
                defaultValue: true,
                type: Sequelize.BOOLEAN,
            },
            customMessage: {
                allowNull: true,
                type: Sequelize.STRING,
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
        await queryInterface.dropTable("ChannelTopics");
    },
};
