"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.bulkInsert(
            "Settings",
            [
                {
                    name: "icalFtpServer",
                    value: null,
                    type: "string",
                    description: "Hostname of FTP server to store iCal files.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "icalFtpPort",
                    value: null,
                    type: "integer",
                    description: "Port of FTP server to store iCal files.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "icalFtpUsername",
                    value: null,
                    type: "string",
                    description: "Username of FTP server to store iCal files.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "icalFtpPassword",
                    value: null,
                    type: "string",
                    description: "Password of FTP server to store iCal files.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    name: "icalUrl",
                    value: null,
                    type: "string",
                    description: "URL prefix of iCal files.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ],
            {}
        );
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.bulkDelete(
            "Settings",
            {
                name: [
                    "icalFtpServer",
                    "icalFtpPort",
                    "icalFtpUsername",
                    "icalFtpPassword",
                    "icalUrl",
                ],
            },
            {}
        );
    },
};
