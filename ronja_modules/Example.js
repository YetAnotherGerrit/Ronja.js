const { MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myExample = {
    client: null,

    init: function(client) {this.client = client},

    hookForCron: function() {
        return [
            {
                schedule: '*/5 * * * *', // https://crontab.guru/
                action: () => {
                        console.debug('Do this every 5 minutes!')
                },

                schedule: '0 8 * * *', // https://crontab.guru/
                action: () => {
                        console.debug('Do this every morning at 8:00!')
                },
            }
        ];
    },

    // Don't forget to also add your slash-commands to the deploy-command.js file and run it once after every change.
    hookForInteraction: async function(interaction)  {
        // https://discord.js.org/#/docs/discord.js/stable/class/Interaction
		if (interaction.commandName == 'ping') {
            interaction.reply('Pong!');
        };
    },

    hookForVoiceUpdate: async function(oldState, newState) {
        // https://discord.js.org/#/docs/discord.js/stable/class/VoiceState
        console.debug('The voice status of a user has updated!');
    },

    hookForEventUpdate: async function(oldGuildScheduledEvent, newGuildScheduledEvent)  {
        // https://discord.js.org/#/docs/discord.js/stable/class/GuildScheduledEvent
        console.debug('A scheduled guild event has been updated!')
    },

    hookForEventStart: async function(oldGuildScheduledEvent, newGuildScheduledEvent)  {
        // https://discord.js.org/#/docs/discord.js/stable/class/GuildScheduledEvent
        console.debug('A scheduled guild event has started!')
    },

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, game)  {
        // https://discord.js.org/#/docs/discord.js/stable/class/ClientPresence
        // https://discord.js.org/#/docs/discord.js/stable/class/Activity
        // game = client.myDB.Games-entry
        console.debug('Someone started playing a game!')
    },


};

module.exports = myExample;