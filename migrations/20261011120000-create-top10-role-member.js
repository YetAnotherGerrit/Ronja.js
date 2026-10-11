"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // Members Ronja gave the top10Role to, per top 10 posting period
        // (weekly, monthly, yearly) - see ronja_modules/Top10.js.
        await queryInterface.createTable("Top10RoleMembers", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            period: {
                allowNull: false,
                type: Sequelize.STRING,
            },
            member: {
                allowNull: false,
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
        await queryInterface.addIndex("Top10RoleMembers", ["period", "member"], { unique: true });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("Top10RoleMembers");
    },
};
