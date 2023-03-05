const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, Colors, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
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
        collectorTimeout: 10, // Maximum of Discord-API is 15 minutes.
    },

    dbZocken: {},

    createZockenText: async function(guildEvent) {
        let maxgames = 10;
        let eventMembers = [];

        guildEvent.fetchSubscribers({withMember: true})
        .then(eventSubcribers => {
            Promise.all(eventSubcribers.map(async (eventSubcriber) => {
                eventMembers.push(eventSubcriber.member.id);
            }))
            .then(() => {
                console.debug(eventMembers.length);
                if (eventMembers.length > 0) {
                    let s = '';
                    this.client.myDB.Games.findAll({
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
                    })
                    .then(g => {
                        g.forEach(gg => {
                            if (maxgames > 0) {
                                s = s.concat(multiChar(gg.cName,':bust_in_silhouette:'), ' ', gg.name, '\n');
                                maxgames = maxgames - 1;
                            }
                        });
            
                        return s;
                    })
            
            
                } else {
                    return "Nobody"
                }
            });
        })

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
        if (interaction.commandName == 'zocken') {
            await interaction.reply({content: 'Loading...'});

            interaction.guild.scheduledEvents.create({
                name: this.l('%s would like to game!', interaction.member.displayName),
                scheduledStartTime: Moment().add(50,'minutes'),
                scheduledEndTime: Moment().add(650,'minutes'), // Optional, but not for EXTERNAL
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: 'Test', // Optional
                entityMetadata: {location: `#${interaction.channel.name} via /zocken`}, // Optional, but not for EXTERNAL,
            })
            .then(event => {
                this.createChannelMemberPing(interaction)
                .then(channelMemberPing => {
                    interaction.editReply({
                        content: this.l('Hey%s and everyone else! (%s)', channelMemberPing, event.url),
                    })
                    .then(() => {
                        interaction.followUp({
                            content: this.l("Hey %s, don't forget to press \"Interested\" yourself on the event I just created for you.", interaction.member.displayName),
                            ephemeral: true,
                        });
                    });
                });

            });
        }
    },

    hookForEventUserUpdate: async function(guildScheduledEvent, user) {
        if (guildScheduledEvent.entityMetadata.location.includes('/zocken')) {
            this.createZockenText(guildScheduledEvent)
            .then(guildDescription => {
                guildScheduledEvent.setDescription(guildDescription);
            });
        }
    },

    hookForCommandInteractionOld: async function(interaction)  {
        if (interaction.commandName == 'zocken') {
			if (this.dbZocken[interaction.channel.id]) {

				await interaction.reply({
					embeds: [ new EmbedBuilder() 
                        .setColor(Colors.Red)
                        .setTitle(this.l('Error!'))
                        .setDescription(this.l('There is already a running Zocken!-request in this channel. Please wait until it has expired.'))
                    ],
					ephemeral: true,
				});
			} else {
				this.dbZocken[interaction.channel.id] = [interaction.member.id];

				let e = await this.createZockenEmbed(interaction);
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

				await interaction.reply({
					content: this.l(`Hey%s and everyone else!`, channelMemberPing),
					embeds: [ e	],
					components: [ this.createActionRow() ],
				});

				let collector = interaction.channel.createMessageComponentCollector({time: 1000*60*this.cfg.collectorTimeout});

				collector.on('collect', async i => {
					if (i.customId === 'zockenYes') {
						this.dbZocken[interaction.channel.id].includes(i.member.id) || this.dbZocken[interaction.channel.id].push(i.member.id);

						let e = await this.createZockenEmbed(interaction);

						await i.update({
							embeds: [ e	],
							components: [ this.createActionRow() ],
						});
					};

					if (i.customId === 'zockenNo') {
						let index = this.dbZocken[interaction.channel.id].indexOf(i.member.id);
						if (index > -1) {
							this.dbZocken[interaction.channel.id].splice(index, 1);
						}

						e = await this.createZockenEmbed(interaction);

						await i.update({
							embeds: [ e	],
							components: [ this.createActionRow() ],
						});
					};
				});

				collector.on('end', async c => {
                    interaction.editReply({
                        content: await this.createZockenFinalString(interaction),
                        embeds: [ ],
                        components: [ ],
                    });

                    delete this.dbZocken[interaction.channel.id];
				});
			};
        };
    },

    hookForButtonInteractionOld: async function(interaction) {
        if (interaction.customId === 'zockenSelect') {
            let [mem,memCreated] = await this.client.myDB.Member.findOrCreate({
                where: {id: interaction.member.id},
                defaults: {zockenmention: 1},
            });

            let statusZockenSelect = mem.zockenmention;
            let statusZockenSelectText = '';

            switch(statusZockenSelect) {
                case 2:
                    statusZockenSelectText = this.l('Ping me also offline.')
                    break;

                case 1:
                    statusZockenSelectText = this.l('Ping me only, when I am online.')
                    break;

                case 0:
                    statusZockenSelectText = this.l('Please, never ping me.')
                    break;
            }

            await interaction.reply({
                embeds: [  new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(this.l('Why is my name in here?'))
                    .setDescription(this.l("There is at least one game that you've played both within the last 100 days. If you don't want to receive those notifications, you can change that here.\n\nYour current setting:\n> %s", statusZockenSelectText))
                ],
                components: [ new ActionRowBuilder()
                    .addComponents( new StringSelectMenuBuilder()
                        .setCustomId('zockenSelected')
                        .setPlaceholder(this.l('Notifications...'))
                        .addOptions([
                            {
                                label: this.l('Ping me also offline.'),
                                description: this.l('Also notify myself that someone wants to game, even when I am offline.'),
                                value: '2',
                            },
                            {
                                label: this.l('Ping me only, when I am online. (Default)'),
                                description: this.l('Notify myself only when I am also online in Discord.'),
                                value: '1',
                            },
                            {
                                label: this.l('Please, never ping me.'),
                                description: this.l('I am not interested in this kind of gaming requests.'),
                                value: '0'
                            }
                        ]),
                    )
                ],
                ephemeral: true,
            });

            let collector = interaction.channel.createMessageComponentCollector({time: 1000*60*this.cfg.collectorTimeout});

            collector.on('collect', async i => {
                if (i.customId === 'zockenSelected') {
                    await this.client.myDB.Member.update(
                        { zockenmention: parseInt(i.values[0]) },
                        { where: {id: i.member.id} },
                    );
            
                    await i.update({
                        embeds: [ new EmbedBuilder().setColor(Colors.Green).setTitle(this.l('Succesful!')).setDescription(this.l('Your settings have been saved.')) ],
                        components: [ ],
                    });
                };
            });

            collector.on('end', async c => {
                if (c.size == 0) {
                    await interaction.editReply({
                        embeds: [ new EmbedBuilder().setColor(Colors.Blue).setTitle(this.l('Expired!')).setDescription(this.l('No changes have been saved.')) ],
                        components: [ ],
                    });
                };
            });
        };
    },
};

module.exports = myZocken;