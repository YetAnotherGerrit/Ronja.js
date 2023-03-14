const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, Colors, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, GuildScheduledEventStatus } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const { DateTime } = require("luxon");

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
        collectorTimeout: 15*60*1000,
    },

    dbZocken: {},

    createZockenText: async function(guildEvent, guildEventCreatorId) {
        let maxGames = 10;
        let eventMembers = [];
        let regexResult;

        if (guildEvent) {
            let eventSubcribers = await guildEvent.fetchSubscribers({withMember: true});

            await Promise.all(eventSubcribers.map(async (eventSubcriber) => eventMembers.push(eventSubcriber.member.id)));
    
            let regex = new RegExp(/\((\d+)\)/);
    
            regexResult = guildEvent.entityMetadata.location.match(regex);
        }

        if (regexResult) {
            if (!eventMembers.includes(regexResult[1])) eventMembers.push(regexResult[1])
        }

        if (guildEventCreatorId) eventMembers.push(guildEventCreatorId);

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
            return this.l("Nobody is participating yet. Don't forget to click that \"Interested\"-Button!");
        }
    },

    createChannelMemberPing: async function(interaction) {
        let channelMemberPing = '';
				
        await Promise.all(interaction.channel.members.map(async (channelMember) => {
            let result = await this.client.myDB.Member.findOne({where: {id: channelMember.id}});
            let statusChannelMember = result ? result.zockenmention : 1;

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
                                [Op.gte]: DateTime.now().setZone(this.cfg.timeZone).minus({days: 100}).toJSDate()
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
                interaction.reply({content: this.l('When you choose a day, you\'ll also need to specify a time!'), ephemeral: true});
                return;
            }

            let startTime = DateTime.now().setZone(this.cfg.timeZone);

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
                    interaction.reply({content: this.l('Please choose a valid time: HH:MM (24-hour time format).'), ephemeral: true});
                    return;
                }
            }

            if (interaction.options.getString('day') == 'tomorrow') {
                startTime = startTime.plus({days: 1});
            }

            if (!interaction.options.getString('day') && !interaction.options.getString('time')) {
                startTime = startTime.plus({minutes: 10});
            }

            if (startTime.diff(DateTime.now(), 'minutes').minutes < 5) {
                interaction.reply({content: this.l('The chosen time and day need to be at least 5 minutes in the future.'), ephemeral: true});
                return;
            }

            let myReply = await interaction.reply({content: this.l('%s would like to game! An event will be created...', interaction.member.displayName)});

            let newEvent = await interaction.guild.scheduledEvents.create({
                name: interaction.options.getString('title') || this.l('%s\'s gaming session', interaction.member.displayName),
                scheduledStartTime: startTime.toJSDate(),
                scheduledEndTime: startTime.plus({hours: 1}).toJSDate(), // Optional, but not for EXTERNAL
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: await this.createZockenText(null, interaction.member.id), // Optional
                entityMetadata: {location: this.l('#%s via /lfg by %s (%s)', interaction.channel.name, interaction.member.displayName, interaction.member.id)}, // Optional, but not for EXTERNAL,
            })

            let channelMemberPing = await this.createChannelMemberPing(interaction);

            interaction.editReply({
                content: this.l('Hey%s and everyone else! (%s)', channelMemberPing, newEvent.url),
                components: [ new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zockenSelect').setLabel(this.l('Why is my name (not) in here?')).setStyle(ButtonStyle.Secondary)) ]

            })

            myReply.createMessageComponentCollector({time: this.cfg.collectorTimeout}).on('end', async collected => {
                if (newEvent.isActive()) {
                    let eventSubcribers = await newEvent.fetchSubscribers();

                    interaction.editReply({
                        content: '',
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setDescription(this.l("%s found %d more to game with.", interaction.member.displayName, eventSubcribers.size - 1))
                        ],
                        components: [ ] 
                    })
                }
                if (newEvent.isCompleted() || newEvent.isCanceled()) {
                    interaction.editReply({
                        content: '',
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(this.l("Unfortunately, nobody was found. Maybe next time."))
                        ],
                        components: [ ] 
                    })
                }
                if (newEvent.isScheduled()) {
                    interaction.editReply({
                        content: newEvent.url,
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Blue)
                            .setDescription(this.l("%s wants hang out later, click \"Interested\" to join.", interaction.member.displayName))
                        ],
                        components: [ ] 
                    })
                }
            })

        }
    },

    hookForButtonInteraction: async function(interaction) {
        if (interaction.customId = "zockenSelect") {
            let [mem,memCreated] = await this.client.myDB.Member.findOrCreate({
                where: {id: interaction.member.id},
                defaults: {zockenmention: 1},
            });

            let statusZockenSelect = mem.zockenmention;
            let statusZockenSelectText = '';

            switch(statusZockenSelect) {
                case 2:
                    statusZockenSelectText = this.l("Ping me also offline.")
                    break;

                case 1:
                    statusZockenSelectText = this.l("Ping me only, when I am online.")
                    break;

                case 0:
                    statusZockenSelectText = this.l("Please, never ping me.")
                    break;
            }

            let myReply = await interaction.reply({
                embeds: [  new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(this.l('Why is my name (not) in here?'))
                    .setDescription(this.l("You are notified if you both played at least one mutual game within the last 100 days. If you don't want to receive those notifications, you can change that now.\n\nYour current setting:\n> %s", statusZockenSelectText))
                ],
                components: [ new ActionRowBuilder()
                    .addComponents( new StringSelectMenuBuilder()
                        .setCustomId('zockenSelected')
                        .setPlaceholder(this.l("Notifications..."))
                        .addOptions([
                            {
                                label: this.l("Ping me also offline."),
                                description: this.l("Also notify myself that someone wants to game, even when I am offline."),
                                value: '2',
                            },
                            {
                                label: this.l("Ping me only, when I am online.")+this.l(" (Default)"),
                                description: this.l("Notify myself only when I am also online in Discord."),
                                value: '1',
                            },
                            {
                                label: this.l("Please, never ping me."),
                                description: this.l("I am not interested in this kind of gaming requests."),
                                value: '0'
                            }
                        ]),
                    )
                ],
                ephemeral: true,
            });

            let collector = myReply.createMessageComponentCollector({time: this.cfg.collectorTimeout});

            collector.on('collect', async i => {
                if (i.customId === 'zockenSelected') {
                    await this.client.myDB.Member.update(
                        { zockenmention: parseInt(i.values[0]) },
                        { where: {id: i.member.id} },
                    );
            
                    await i.update({
                        embeds: [ new EmbedBuilder().setColor(Colors.Green).setTitle(this.l("Succesful!")).setDescription(this.l("Your settings have been saved.")) ],
                        components: [ ],
                    });
                };
            });

            collector.on('end', async c => {
                if (c.size == 0) {
                    await interaction.editReply({
                        embeds: [ new EmbedBuilder().setColor(Colors.Blue).setTitle(this.l("Expired!")).setDescription(this.l("No changes have been saved.")) ],
                        components: [ ],
                    });
                };
            });
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