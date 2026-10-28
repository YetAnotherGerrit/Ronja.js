"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // The password or token GameDig needs to check some games' servers,
        // e.g. Palworld's admin password (see passwordOptions in core/gameServer.js).
        await queryInterface.addColumn("GameServers", "password", {
            allowNull: true,
            type: Sequelize.STRING,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("GameServers", "password");
    },
};
