'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('Settings', [{
      name: 'voiceChannelBitrate',
      type: 'integer',
      description: 'Bitrate for dynamically created voice channels.',
      value: '96000',
      createdAt: new Date(),
      updatedAt: new Date()
    }], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Settings', { name: 'voiceChannelBitrate' }, {});
  }
};