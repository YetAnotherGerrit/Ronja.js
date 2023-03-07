const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, Colors, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, GuildScheduledEventStatus } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const { DateTime } = require("luxon");
const Moment = require('moment');

// TODO: Noch ein eine eigene Befehlsbibliothek packen. Brauch ich öfters. Vielleicht gibt es auch einen eleganteren Weg.
function multiChar(a,c) {
	let s = '';
	for (let i = 0; i < a; i++) {
		s += c;
	}
	return s;
}

const myZocken = {
    defaultConfig: {
        timeZone: 'Europe/Berlin',
    },

    dbZocken: {},

    createZockenText: async function(guildEvent) {
        let maxGames = 10;
        let eventMembers = [];

        let eventSubcribers = await guildEvent.fetchSubscribers({withMember: true});

        await Promise.all(eventSubcribers.map(async (eventSubcriber) => eventMembers.push(eventSubcriber.member.id)));

        if (eventMembers.length > 0) {
            let zockenText = '';

            let gamesPlayed = await this.client.myDB.Games.findAll({
                raw: true,
                attributes: [
                    'name',
                    [Sequelize.fn('COUNT', '*'),'cName']
                ],
                include: [
                    {
                        model: this.client.myDB.GamesPlayed,
                        where: {
                            member: eventMembers
                        }
    
                    }
                ],
                order: [
                    [Sequelize.fn('count', Sequelize.col('*')),'DESC'],
                    [this.client.myDB.GamesPlayed, 'lastplayed', 'DESC'],
                ],
                group: 'Games.name',
            });

            gamesPlayed.forEach(gamePlayed => {
                if (maxGames > 0) {
                    zockenText = zockenText.concat(multiChar(gamePlayed.cName,':bust_in_silhouette:'), ' ', gamePlayed.name, '\n');
                    maxGames = maxGames - 1;
                }
            });
    
            return zockenText;
    
        } else {
            return this.l('Nobody is participating yet. Don\'t forget to click that "Interested"-Button!');
        }
    },

    createChannelMemberPing: async function(interaction) {
        let channelMemberPing = '';
				
        await Promise.all(interaction.channel.members.map(async (channelMember) => {
            /* From when the users could select if they want to get notified by channel ping, maybe reintroduce later.
            let result = await this.client.myDB.Member.findOne({where: {id: channelMember.id}});
            let statusChannelMember = result ? result.zockenmention : 1; */
            let statusChannelMember = 1;

            let commonGames = 0;
            let g = await this.client.myDB.Games.findAll({
                raw: true,
                attributes: [
                    'name',
                    [Sequelize.fn('COUNT', '*'),'cName']
                ],
                include: [
                    {
                        model: this.client.myDB.GamesPlayed,
                        where: {
                            member: [interaction.member.id,channelMember.id],
                            lastplayed: {
                                [Op.gte]: Moment().subtract(100,'days')
                            }
                        }
        
                    }
                ],
                order: [
                    [Sequelize.fn('count', Sequelize.col('*')),'DESC'],
                    ['name', 'ASC'],
                
                ],
                group: 'Games.name',
            });

            g.forEach(gg => {
                if (gg.cName === 2) {
                    commonGames = commonGames + 1;
                }
            });

            if (!channelMember.user.bot &&
                commonGames > 0 &&
                    (
                        (channelMember.presence && ((channelMember.presence.status == 'online' && statusChannelMember > 0) || (channelMember.presence.status == 'idle' && statusChannelMember > 0) || (channelMember.presence.status == 'offline' && statusChannelMember > 1))) ||
                        (!channelMember.presence && statusChannelMember > 1)
                    )
                ) {
                channelMemberPing = channelMemberPing.concat(` <@${channelMember.id}>`);
            }
        }));

        return channelMemberPing;
    },

    hookForCommandInteraction: async function(interaction) {
        if (interaction.commandName == 'lfg') {
            if (interaction.options.getString('day') && !interaction.options.getString('time')) {
                interaction.reply({content: this.l('When you choose a day you\'ll also need to specify a time!'), ephemeral: true});
                return;
            }

            let startTime = DateTime.local();

            if (interaction.options.getString('time')) {
                let regex = new RegExp(/(\d{2}):(\d{2})/);

                let regexResult = interaction.options.getString('time').match(regex);

                if (regexResult) {
                    if (regexResult[1] < 0 || regexResult[1] > 23) {
                        interaction.reply({content: this.l('Please choose a valid time: HH:MM. Hour needs to be within 0-23.'), ephemeral: true});
                        return;
                    }
                    if (regexResult[2] < 0 || regexResult[2] > 59) {
                        interaction.reply({content: this.l('Please choose a valid time: HH:MM. Minute needs to be within 0-59.'), ephemeral: true});
                        return;
                    }

                    startTime = DateTime.fromObject({hour: regexResult[1], minute: regexResult[2]}, {zone: this.cfg.timeZone});

                } else {
                    interaction.reply({content: this.l('Please choose a valid time: HH:MM (24 hour time format).'), ephemeral: true});
                    return;
                }
            }

            if (interaction.options.getString('day') == 'tomorrow') {
                startTime = startTime.plus({days: 1});
            }

            if (!interaction.options.getString('day') && !interaction.options.getString('time')) {
                startTime = startTime.plus({minutes: 10});
            }

            if (startTime.diff(DateTime.now(), 'minutes') < 5) {
                interaction.reply({content: this.l('The choosen time and day needs to be at least 5 minutes in the future.'), ephemeral: true});
                return;
            }

            await interaction.reply({content: this.l('%s would like to game! Event will be created...', interaction.member.displayName)});

            let newEvent = await interaction.guild.scheduledEvents.create({
                name: interaction.options.getString('title') || this.l('%s\'s gaming session', interaction.member.displayName),
                scheduledStartTime: startTime.toString(),
                scheduledEndTime: startTime.plus({hours: 1}).toString(), // Optional, but not for EXTERNAL
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: this.l('Don\'t forget to click that "Interested"-Button!'), // Optional
                entityMetadata: {location: this.l('#%s via /lfg by %s', interaction.channel.name, interaction.member.displayName)}, // Optional, but not for EXTERNAL,
            })

            let channelMemberPing = await this.createChannelMemberPing(interaction);

            interaction.editReply({
                content: this.l('Hey%s and everyone else! (%s)', channelMemberPing, newEvent.url),
            })
        }
    },

    hookForEventUserUpdate: async function(guildScheduledEvent, user) {
        if (guildScheduledEvent.entityMetadata.location.includes('/lfg')) {
            let guildDescription = await this.createZockenText(guildScheduledEvent);
            guildScheduledEvent.setDescription(guildDescription);
        }
    },

    hookForEventStart: async function(oldGuildScheduledEvent, newGuildScheduledEvent) {
        if (newGuildScheduledEvent.entityMetadata.location.includes('/lfg')) {
            let eventSubcribers = await newGuildScheduledEvent.fetchSubscribers();
            if (eventSubcribers.size < 2) {
                newGuildScheduledEvent.setStatus(GuildScheduledEventStatus.Completed, 'Not enough participants.');
            }
        }
    },

};

module.exports = myZocken;