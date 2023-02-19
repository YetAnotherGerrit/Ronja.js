const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, Colors } = require('discord.js');
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

    createZockenEmbed: async function(interaction) {
        let maxgames = 10;
        let sPlayer = '';
        let aPlayerNames = [];
    
        if (this.dbZocken[interaction.channel.id].length === 0) {
            sPlayer = this.l('Nobody');
        } else {
            await this.dbZocken[interaction.channel.id].forEach(playerId => {
                interaction.guild.members.fetch(playerId).then(m => {
                    aPlayerNames.push(m.displayName);
                });
            });
            sPlayer = aPlayerNames.join(', ') || this.l('Nobody');
            
            // Ersetze letztes Komma durch "und":
            if (sPlayer.lastIndexOf(',') > -1) {
                sPlayer = sPlayer.substring(0,sPlayer.lastIndexOf(',')) + this.l(' and') + sPlayer.substring(sPlayer.lastIndexOf(',')+1,sPlayer.length);
            }
        };
    
    
        let e = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Zeit zum Zocken!')
        .setDescription(this.l('%s %s in, who is willing to join?', sPlayer, this.dbZocken[interaction.channel.id].length > 1 ? this.l('are') : this.l('is')))
        .setFooter({ text: this.l('The following buttons will be availble for %d minutes:', this.cfg.collectorTimeout) });
    
        if (this.dbZocken[interaction.channel.id].length > 0) {
            let channelCount = await this.client.myDB.Games.count({where: {channel: interaction.channel.id}});
            if (channelCount === 0 ) {
                let s = '';
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
                                member: this.dbZocken[interaction.channel.id]
                            }
        
                        }
                    ],
                    order: [
                        [Sequelize.fn('count', Sequelize.col('*')),'DESC'],
                        [this.client.myDB.GamesPlayed, 'lastplayed', 'DESC'],
                    ],
                    group: 'Games.name',
                });
        
                g.forEach(gg => {
                    if (maxgames > 0) {
                        s = s.concat(multiChar(gg.cName,':bust_in_silhouette:'), ' ', gg.name, '\n');
                        maxgames = maxgames - 1;
                    }
                });
        
                // s = Object.keys(g).map(key => g[key].name).join(', ');
        
                if (s != '') {
                    e.addFields([{ name: this.l("I'll suggest the following games:"), value: s }]);
                };
            };
        };
    
        return e;
    },

    createZockenFinalString: async function(interaction) {
        let sPlayer = '';
        let aPlayerNames = [];

        let returnValue = '';
    
        if (this.dbZocken[interaction.channel.id].length === 0) {
            sPlayer = this.l('Nobody');
        } else {
            await this.dbZocken[interaction.channel.id].forEach(playerId => {
                interaction.guild.members.fetch(playerId).then(m => {
                    aPlayerNames.push(m.displayName);
                });
            });
            sPlayer = aPlayerNames.join(', ') || this.l('Nobody');
            
            // Ersetze letztes Komma durch "und":
            if (sPlayer.lastIndexOf(',') > -1) {
                sPlayer = sPlayer.substring(0,sPlayer.lastIndexOf(',')) + ' und' + sPlayer.substring(sPlayer.lastIndexOf(',')+1,sPlayer.length);
            }
        };

        if (this.dbZocken[interaction.channel.id].length > 1) {
            returnValue = this.l('%s have found together.', sPlayer);
        } else {
            returnValue = this.l('Unfortunately, nobody has been found.');
        };

        return returnValue;
    },

    hookForInteraction: async function(interaction)  {
        let myActionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('zockenYes')
                .setLabel(this.l('Count me in!'))
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('zockenNo')
                .setLabel(this.l('No, sorry...'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('zockenSelect')
                .setLabel(this.l('Why is my name in here?'))
                .setStyle(ButtonStyle.Secondary),
        );
    
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
					components: [ myActionRow ],
				});

				let collector = interaction.channel.createMessageComponentCollector({time: 1000*60*this.cfg.collectorTimeout});

				collector.on('collect', async i => {
					if (i.customId === 'zockenYes') {
						this.dbZocken[interaction.channel.id].includes(i.member.id) || this.dbZocken[interaction.channel.id].push(i.member.id);

						let e = await this.createZockenEmbed(interaction);

						await i.update({
							embeds: [ e	],
							components: [ myActionRow ],
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
							components: [ myActionRow ],
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