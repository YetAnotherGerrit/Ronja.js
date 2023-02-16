const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

// TODO: move to config
const cMinimumPlayersForCreation = 3;
const cDaysRelevantForCreation = 30;
const cDaysToArchive = 30;
const cDaysTarget = 100;

const myDynamicTextChannels = {
    client: null,

    init: function(client) {this.client = client},

    defaultOverrides: async function(guild) {
        return [
            {
                id: await guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: await guild.members.me,
                allow: [PermissionFlagsBits.ViewChannel],
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
        let returnValue = await this.getPlayersForGame(game,pDays)
        return returnValue.count;
    },

    hasGameBeenPlayedForChannel: async function(channel, pDays) {
        let gamesPlayed  = await this.client.myDB.GamesPlayed.findAndCountAll({
            where: {
                lastplayed: { [Op.gte]: Moment().subtract(pDays,'days') }
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

        return (gamesPlayed.count > 0);
    },

    assignAllPlayersToChannel: async function(channel, game, pDays) {
    // TODO: Remove game from function, as a channel can be for more than one game. Related to issue #9.
        let players = await this.getPlayersForGame(game, pDays);

        players.rows.forEach(async player => {
            let player_member = await channel.guild.members.fetch(player.member);
            channel.permissionOverwrites.create(player_member,{'ViewChannel': true});
        });
    },

    sortTextChannelCategoryByName: async function(categoryChannel) {
        let channels = categoryChannel.children.cache.filter(c => c.type === ChannelType.GuildText);
        channels.sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < channels.size; i++) {
            await channels.at(i).setPosition(i);
        }        
    },

    createTextChannel: async function(game, newActivity, newPresence) {
        // TODO: Are all parameters necessary?
        let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie);
        console.log(await this.defaultOverrides(newPresence.guild));
        let newChannel = await autoChannel.children.create({
            name: newActivity.name,
            type: ChannelType.GuildText,
            permissionOverwrites: await this.defaultOverrides(newPresence.guild),
        });

        this.assignAllPlayersToChannel(newChannel,game,cDaysTarget);
        game.update({channel: newChannel.id});

        console.log(`Created new text channel #${newChannel.name}.`);
        this.sortTextChannelCategoryByName(autoChannel);
    },

    checkActiveTextChannel: async function(channel) {
        if (!await this.hasGameBeenPlayedForChannel(channel, cDaysToArchive)) {
            let autoChannel = await this.client.channels.fetch(this.client.myConfig.ArchivSpieleKategorie);
            channel.setParent(autoChannel);
            channel.permissionOverwrites.set(await this.defaultOverrides(channel.guild));
        
            console.log(`Moved #${channel.name} to archive.`);
            this.sortTextChannelCategoryByName(autoChannel);
        };
    },

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, game)  {
        // TODO: Check if member has access right for parent-category AktiveSpieleKategorie
        if (game.channel) {
            let gameChannel = await this.client.channels.fetch(game.channel);
            if (gameChannel.parentId == this.client.myConfig.ArchivSpieleKategorie) {
                if (await this.countPlayersForGame(game,cDaysTarget) > 1) {
                    let autoChannel = await this.client.channels.fetch(this.client.myConfig.AktiveSpieleKategorie);
                    gameChannel.setParent(autoChannel);
                    await gameChannel.permissionOverwrites.set(await this.defaultOverrides(gameChannel.guild));
                    this.assignAllPlayersToChannel(gameChannel,game,cDaysTarget);
                };
            } else {
                gameChannel.permissionOverwrites.create(newPresence.member.user,{'ViewChannel': true});
            };
        } else {
            if (await this.countPlayersForGame(game, cDaysRelevantForCreation) >= cMinimumPlayersForCreation) {
                this.createTextChannel(game, newActivity, newPresence);
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

module.exports = myDynamicTextChannels;