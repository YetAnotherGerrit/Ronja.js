const { ChannelType, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const { DateTime } = require('luxon');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

const myDynamicTextChannels = {
    defaultConfig: {
        dtcGamesCategory: null,             // please set in _SECRET/config.js
        dtcArchivedGamesCategory: null,     // please set in _SECRET/config.js
        dtcNotificationChannel: null,

        minimumPlayersForCreation: 3,
        daysRelevantForCreation: 30,
        daysToArchive: 30,
        daysTarget: 100,

        timeZone: 'Europe/Berlin',
    },

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
                lastplayed: { [Op.gte]: DateTime.now().setZone(this.cfg.timeZone).minus({days: pDays}).toJSDate() }
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
                lastplayed: { [Op.gte]: DateTime.now().setZone(this.cfg.timeZone).minus({days: pDays}).toJSDate() }
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

    notifyChannel: async function(myTitle, myDescription) {
        if (this.cfg.dtcNotificationChannel) {
            this.client.channels.fetch(this.cfg.dtcNotificationChannel)
            .then(notificationChannel => {
                let e = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(myTitle)
                .setDescription(myDescription);
        
                notificationChannel.send({embeds: [e]})
                .catch(console.error);
            })
            .catch(console.warn);
        }
    },

    createTextChannel: async function(game, newActivity, newPresence) {
        if (this.cfg.dtcGamesCategory) {
            let autoChannel = await this.client.channels.fetch(this.cfg.dtcGamesCategory);
            let newChannel = await autoChannel.children.create({
                name: newActivity.name,
                type: ChannelType.GuildText,
                permissionOverwrites: await this.defaultOverrides(newPresence.guild),
            });
    
            this.assignAllPlayersToChannel(newChannel, game, this.cfg.daysTarget);
            game.update({channel: newChannel.id});
    
            console.log(`Created new text channel #${newChannel.name}.`);
            this.sortTextChannelCategoryByName(autoChannel);

            this.notifyChannel(
                this.l('A new text channel was created'),
                this.l('Some of you guys played a new game recently. To provide you with a channel to talk about it, <#%s> has been created.\n\nOthers will be added to that channel once I see them playing the same game.', newChannel.id)
            );
        } else {
            console.warn('WARNING: no dtcGamesCategory set in config file!');
        }
    },

    checkActiveTextChannel: async function(channel) {
        if (this.cfg.dtcArchivedGamesCategory) {
            if (!await this.hasGameBeenPlayedForChannel(channel, this.cfg.daysToArchive)) {
                let autoChannel = await this.client.channels.fetch(this.cfg.dtcArchivedGamesCategory);
                channel.setParent(autoChannel);
                channel.permissionOverwrites.set(await this.defaultOverrides(channel.guild));
            
                console.log(`Moved #${channel.name} to archive.`);
                this.sortTextChannelCategoryByName(autoChannel);
            }
        } else {
            console.warn('WARNING: no dtcArchivedGamesCategory set in config file!');
        }
    },

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, game)  {
        if (this.cfg.dtcArchivedGamesCategory) {
            // TODO: Check if member has access right for parent-category dtcGamesCategory
            if (game.channel) {
                let gameChannel = await this.client.channels.fetch(game.channel);
                if (gameChannel.parentId == this.cfg.dtcArchivedGamesCategory) {
                    if (await this.countPlayersForGame(game, this.cfg.daysTarget) > 1) {
                        let autoChannel = await this.client.channels.fetch(this.cfg.dtcGamesCategory);
                        gameChannel.setParent(autoChannel);
                        await gameChannel.permissionOverwrites.set(await this.defaultOverrides(gameChannel.guild));
                        this.assignAllPlayersToChannel(gameChannel, game, this.cfg.daysTarget);

                        console.log(`Moved #${gameChannel.name} from archive to active.`);
                        
                        this.sortTextChannelCategoryByName(autoChannel);
                        this.notifyChannel(
                            this.l('A text channel was re-activated'),
                            this.l('Some of you guys re-discovered a forgotten game recently. <#%s> has been re-activated from the archive.\n\nOthers will be added to that channel once I see them playing it.', gameChannel.id)
                        );    
                    }
                } else {
                    gameChannel.permissionOverwrites.create(newPresence.member.user,{'ViewChannel': true});
                }
            } else {
                if (await this.countPlayersForGame(game, this.cfg.daysRelevantForCreation)
                        >= this.cfg.minimumPlayersForCreation) {
                    this.createTextChannel(game, newActivity, newPresence);
                }
            }
        } else {
            console.warn('WARNING: no dtcArchivedGamesCategory set in config file!');
        }
    },

    hookForCron: function() {
        return [
            {
                schedule: '0 5 * * *', // https://crontab.guru/
                action: async () => {
                    if (this.cfg.dtcGamesCategory) {
                        let autoChannel = await this.client.channels.fetch(this.cfg.dtcGamesCategory);
                        await Promise.all(autoChannel.children.map(async (gameChannel) => {
                            this.checkActiveTextChannel(gameChannel);
                        }));
                    } else {
                        console.warn('WARNING: no dtcGamesCategory set in config file!');
                    }
                },
            }
        ];
    },


};

module.exports = myDynamicTextChannels;