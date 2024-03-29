const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, Colors, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, GuildScheduledEventStatus, ChannelType } = require('discord.js');
const { DateTime } = require("luxon");
const Sequelize = require('sequelize');
const Op = Sequelize.Op;

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
        collectorTimeout: 14*60*1000,
    },

    dbVoiceStatus: {},

    createZockenTextForEvent: async function(lng, guildEvent, guildEventCreatorId) {
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

        return await this.createZockenText(eventMembers) || this.l(lng,"Nobody is participating yet. Don't forget to click that \"Interested\"-Button!");
    },

    createZockenText: async function(zockenMembers) {
        let maxGames = 10;

        if (zockenMembers.length > 0) {
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
                            member: zockenMembers
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
            return null;
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
                interaction.reply({content: this.l(interaction.locale,'When you choose a day, you\'ll also need to specify a time!'), ephemeral: true});
                return;
            }

            let startTime = DateTime.now().setZone(this.cfg.timeZone);

            if (interaction.options.getString('time')) {
                let regex = new RegExp(/(\d{2}):(\d{2})/);

                let regexResult = interaction.options.getString('time').match(regex);

                if (regexResult) {
                    if (regexResult[1] < 0 || regexResult[1] > 23) {
                        interaction.reply({content: this.l(interaction.locale,'Please choose a valid time: HH:MM. Hour needs to be within 0-23.'), ephemeral: true});
                        return;
                    }
                    if (regexResult[2] < 0 || regexResult[2] > 59) {
                        interaction.reply({content: this.l(interaction.locale,'Please choose a valid time: HH:MM. Minute needs to be within 0-59.'), ephemeral: true});
                        return;
                    }

                    startTime = DateTime.fromObject({hour: regexResult[1], minute: regexResult[2]}, {zone: this.cfg.timeZone});

                } else {
                    interaction.reply({content: this.l(interaction.locale,'Please choose a valid time: HH:MM (24-hour time format).'), ephemeral: true});
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
                interaction.reply({content: this.l(interaction.locale,'The chosen time and day need to be at least 5 minutes in the future.'), ephemeral: true});
                return;
            }

            let myReply = await interaction.reply({content: this.l(interaction.locale,'%s would like to game! An event will be created...', interaction.member.displayName)});

            let newEvent = await interaction.guild.scheduledEvents.create({
                name: interaction.options.getString('title') || this.l(interaction.locale,'%s\'s gaming session', interaction.member.displayName),
                scheduledStartTime: startTime.toJSDate(),
                scheduledEndTime: startTime.plus({hours: 1}).toJSDate(), // Optional, but not for EXTERNAL
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: await this.createZockenTextForEvent(interaction.locale, null, interaction.member.id), // Optional
                entityMetadata: {location: this.l(interaction.locale,'#%s via /lfg by %s (%s)', interaction.channel.name, interaction.member.displayName, interaction.member.id)}, // Optional, but not for EXTERNAL,
            })

            let channelMemberPing = await this.createChannelMemberPing(interaction);

            interaction.editReply({
                content: this.l(interaction.locale,'Hey%s and everyone else! (%s)', channelMemberPing, newEvent.url),
                components: [ new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zockenSelect').setLabel(this.l(interaction.locale,'Why is my name (not) in here?')).setStyle(ButtonStyle.Secondary)) ]

            })

            myReply.createMessageComponentCollector({time: this.cfg.collectorTimeout}).on('end', async collected => {
                if (newEvent.isActive()) {
                    let eventSubcribers = await newEvent.fetchSubscribers();

                    interaction.editReply({
                        content: '',
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setDescription(this.l(interaction.locale,"%s found %d more to game with.", interaction.member.displayName, eventSubcribers.size - 1))
                        ],
                        components: [ ] 
                    })
                }
                if (newEvent.isCompleted() || newEvent.isCanceled()) {
                    interaction.editReply({
                        content: '',
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(this.l(interaction.locale,"Unfortunately, nobody was found. Maybe next time."))
                        ],
                        components: [ ] 
                    })
                }
                if (newEvent.isScheduled()) {
                    interaction.editReply({
                        content: newEvent.url,
                        embeds: [ new EmbedBuilder()
                            .setColor(Colors.Blue)
                            .setDescription(this.l(interaction.locale,"%s wants hang out later, click \"Interested\" to join.", interaction.member.displayName))
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
                    statusZockenSelectText = this.l(interaction.locale,"Ping me also offline.")
                    break;

                case 1:
                    statusZockenSelectText = this.l(interaction.locale,"Ping me only, when I am online.")
                    break;

                case 0:
                    statusZockenSelectText = this.l(interaction.locale,"Please, never ping me.")
                    break;
            }

            let myReply = await interaction.reply({
                embeds: [  new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(this.l(interaction.locale,'Why is my name (not) in here?'))
                    .setDescription(this.l(interaction.locale,"You are notified if you both played at least one mutual game within the last 100 days. If you don't want to receive those notifications, you can change that now.\n\nYour current setting:\n> %s", statusZockenSelectText))
                ],
                components: [ new ActionRowBuilder()
                    .addComponents( new StringSelectMenuBuilder()
                        .setCustomId('zockenSelected')
                        .setPlaceholder(this.l(interaction.locale,"Notifications..."))
                        .addOptions([
                            {
                                label: this.l(interaction.locale,"Ping me also offline."),
                                description: this.l(interaction.locale,"Also notify myself that someone wants to game, even when I am offline."),
                                value: '2',
                            },
                            {
                                label: this.l(interaction.locale,"Ping me only, when I am online.")+this.l(interaction.locale," (Default)"),
                                description: this.l(interaction.locale,"Notify myself only when I am also online in Discord."),
                                value: '1',
                            },
                            {
                                label: this.l(interaction.locale,"Please, never ping me."),
                                description: this.l(interaction.locale,"I am not interested in this kind of gaming requests."),
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
                        embeds: [ new EmbedBuilder().setColor(Colors.Green).setTitle(this.l(interaction.locale,"Succesful!")).setDescription(this.l(interaction.locale,"Your settings have been saved.")) ],
                        components: [ ],
                    });
                };
            });

            collector.on('end', async c => {
                if (c.size == 0) {
                    await interaction.editReply({
                        embeds: [ new EmbedBuilder().setColor(Colors.Blue).setTitle(this.l(interaction.locale,"Expired!")).setDescription(this.l(interaction.locale,"No changes have been saved.")) ],
                        components: [ ],
                    });
                };
            });
        }
    },

    hookForEventUserUpdate: async function(guildScheduledEvent, user) {
        if (guildScheduledEvent.entityMetadata.location.includes('/lfg')) {
            let guildDescription = await this.createZockenTextForEvent(guildScheduledEvent.guild.preferredLocale, guildScheduledEvent);
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

    hookForVoiceUpdate: async function(oldState, newState) {
        if (newState.channel) this.updateChannelVoiceStatus(newState.channel);
        if ((oldState.channel && !newState.channel) || (oldState.channel && newState.channel && oldState.channel.id != newState.channel.id)) this.updateChannelVoiceStatus(oldState.channel);
    },

    updateChannelVoiceStatus: async function(channel) {
        if (channel && channel.type === ChannelType.GuildVoice && channel.userLimit === 0 && channel.members.size > 0) {
            if (!this.dbVoiceStatus[channel.id]) {
                this.dbVoiceStatus[channel.id] = await channel.send(this.l(channel.guild.preferredLocale, "Open the voice channel's text channel to see what games the members can play..."));
            }

            let myMsg = this.dbVoiceStatus[channel.id];
            let voiceMembers = [];

            channel.members.forEach(member => {
                voiceMembers.push(member.id);
            })

            myMsg.edit(this.l(channel.guild.preferredLocale, "This games are played by the channel members:\n") + await this.createZockenText(voiceMembers))
            .catch(console.error);
        }
    }

};

module.exports = myZocken;