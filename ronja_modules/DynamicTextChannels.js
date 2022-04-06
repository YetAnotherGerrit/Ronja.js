const { MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

// TODO: move to config
const cMinimumPlayersForCreation = 2;
const cDaysRelevantForCreation = 30;
const cDaysTarget = 100;

const myExample = {
    client: null,

    init: function(client) {this.client = client},

    defaultOverrides: async function(guild) {
        return [
            {
                id: await guild.roles.everyone,
                deny: ['VIEW_CHANNEL'],
            },
            {
                id: await guild.me,
                allow: ['VIEW_CHANNEL'],
            },
        ];
    },


    getPlayersForGame: async function(game, pDays) {
        let players  = await this.client.myDB.GamesPlayed.findAndCountAll({
            where: {
                GameId: game.id,
                lastplayed: { [Op.gte]: Moment().subtract(pDays,'days') }
            },
        });

        return players;
    },

    countPlayersForGame: async function(game, pDays) {
        return await this.getPlayersForGame(game,pDays).count;
    },

    assignAllPlayersToChannel: async function(channel, game, pDays) {
        let players = await this.getPlayersForGame(game, pDays);

        players.rows.forEach(async player => {
            let player_member = await channel.guild.members.fetch(player.member);
            newChannel.permissionOverwrites.create(player_member,{'VIEW_CHANNEL': true});
        });
    },

    createTextChannel: async function(game) {
        let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie)
        let newChannel = await autoChannel.createChannel(newActivity.name,{
            type: 'GUILD_TEXT',
            permissionOverwrites: this.defaultOverrides(newPresence.guild),
        });

        this.assignAllPlayersToChannel(newChannel,game,cDaysTarget)
        game.update({channel: newChannel.id});
    },

    checkIfArchive: async function(channel, game) {
        if (channel.parentId == this.client.myConfig.ArchivSpieleKategorie) {
            if (this.countPlayersForGame(game,cDaysTarget) > 1) {
                let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie);
                channel.setParent(autoChannel);
                channel.permissionOverwrites.set(this.defaultOverrides(channel.guild));
                this.assignAllPlayersToChannel(channel,game,cDaysTarget);
            };
        };
    },

    checkActiveTextChannel: async function(channel) {
        let activePlayerCount = 0;

        await Promise.all(channel.members.map(async (m) => {
            if (!m.user.bot) {
                let games  = await this.client.myDB.GamesPlayed.findAndCountAll({
                    where: {
                        member: m.id,
                        lastplayed: { [Op.gte]: Moment().subtract(cDaysTarget,'days') }
                    },
                    include: [
                        {
                            model: this.client.myDB.Games,
                            where: {
                                channel: channel.id
                            },
                            required: true,
                        }
                    ],
                });
    
                if (games.count > 0) {
                    activePlayerCount = activePlayerCount + 1;
                } else {
                    channel.permissionOverwrites.delete(m);
                    console.log(`Removed ${m.displayName} from #${channel.name}.`);
                }
            }
        }));

        if (activePlayerCount < 2) {
            let autoChannel = await this.client.channels.fetch(this.client.myConfig.ArchivSpieleKategorie);
            channel.setParent(autoChannel);
            console.log(`Moved #${channel.name} to archive.`);
        };
    },

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, game)  {
        if (game.channel) {
            let gameChannel = await this.client.channels.fetch(game.channel);
            gameChannel.permissionOverwrites.create(newPresence.member.user,{'VIEW_CHANNEL': true});
            this.checkIfArchive(gameChannel, game);
        } else {
            if (this.countPlayersForGame(game, cDaysRelevantForCreation) >= cMinimumPlayersForCreation) {
                this.createTextChannel(game);
            };
        };
    },

    hookForCron: function() {
        return [
            {
                schedule: '0 5 * * *', // https://crontab.guru/
                action: async () => {
                    let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie);
                    await Promise.all(autoChannel.children.map(async (gameChannel) => {
                        this.checkActiveTextChannel(gameChannel);
                    }));
                },
            }
        ];
    },


};

module.exports = myExample;