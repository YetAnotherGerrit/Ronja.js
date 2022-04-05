const { MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myExample = {
    client: null,

    init: function(client) {this.client = client},

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, gameCreated)  {
        // https://discord.js.org/#/docs/discord.js/stable/class/ClientPresence
        // https://discord.js.org/#/docs/discord.js/stable/class/Activity
        // gameCreated = Boolean if it was new to Ronjas Gamedatabase
        console.debug('Someone started playing a game!')
    },


};

module.exports = myExample;