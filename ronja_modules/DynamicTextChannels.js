const { MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

// TODO: move to config
const cMinimumPlayers = 3;

const myExample = {
    client: null,

    init: function(client) {this.client = client},

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, game)  {
        if (game.channel) {
            let gameChannel = await this.client.channels.fetch(game.channel);
            gameChannel.permissionOverwrites.create(newPresence.member.user,{'VIEW_CHANNEL': true});
        } else {
            let players  = await this.client.myDB.GamesPlayed.findAndCountAll({
                where: {GameId: game.id},
            });

            if (players.count >= cMinimumPlayers) {
                let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie)
                let newChannel = await autoChannel.createChannel(newActivity.name,{
                    type: 'GUILD_TEXT',
                    permissionOverwrites: [
                        {
                            id: newPresence.guild.roles.everyone,
                            deny: ['VIEW_CHANNEL'],
                        },
                        {
                            id: newPresence.guild.me,
                            allow: ['VIEW_CHANNEL'],
                        },
                    ],										
                });
                players.rows.forEach(async player => {
                    let player_member = await newPresence.guild.members.fetch(player.member);
                    newChannel.permissionOverwrites.create(player_member,{'VIEW_CHANNEL': true});
                });
                game.update({channel: newChannel.id});
            };
        };
    },


};

module.exports = myExample;