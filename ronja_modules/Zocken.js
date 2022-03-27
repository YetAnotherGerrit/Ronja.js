const { MessageEmbed, MessageActionRow, MessageButton, MessageSelectMenu } = require('discord.js');
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
    client: null,

    configCollectorTimeout: 10,

    dbZocken: {},

    init: function(client) {this.client = client},

	myActionRow: new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('zockenYes')
            .setLabel('Ich bin dabei!')
            .setStyle('SUCCESS'),
        new MessageButton()
            .setCustomId('zockenNo')
            .setLabel('Ne, doch nicht...')
            .setStyle('DANGER'),
        new MessageButton()
            .setCustomId('zockenSelect')
            .setLabel('Warum steht da mein Name?')
            .setStyle('SECONDARY'),
    ),

    createZockenEmbed: async function(interaction) {
        let maxgames = 10;
        let sPlayer = '';
        let aPlayerNames = [];
    
        if (this.dbZocken[interaction.channel.id].length === 0) {
            sPlayer = 'Niemand';
        } else {
            await this.dbZocken[interaction.channel.id].forEach(playerId => {
                interaction.guild.members.fetch(playerId).then(m => {
                    aPlayerNames.push(m.displayName);
                });
            });
            sPlayer = aPlayerNames.join(', ') || 'Niemand';
            
            // Ersetze letztes Komma durch "und":
            if (sPlayer.lastIndexOf(',') > -1) {
                sPlayer = sPlayer.substring(0,sPlayer.lastIndexOf(',')) + ' und' + sPlayer.substring(sPlayer.lastIndexOf(',')+1,sPlayer.length);
            }
        };
    
    
        let e = new MessageEmbed()
        .setColor('BLUE')
        .setTitle('Zeit zum Zocken!')
        .setDescription(`${sPlayer} ${this.dbZocken[interaction.channel.id].length > 1 ? 'sind' : 'ist'} dabei, wer noch?`)
        .setFooter(`P.S.: Falls kein Button genutzt wird, zerstört sich diese Nachricht nach ${this.configCollectorTimeout} Minuten selbst.`);
    
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
                    e.addField('Die folgende Spiele würde ich vorschlagen:',s);
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
            sPlayer = 'Niemand';
        } else {
            await this.dbZocken[interaction.channel.id].forEach(playerId => {
                interaction.guild.members.fetch(playerId).then(m => {
                    aPlayerNames.push(m.displayName);
                });
            });
            sPlayer = aPlayerNames.join(', ') || 'Niemand';
            
            // Ersetze letztes Komma durch "und":
            if (sPlayer.lastIndexOf(',') > -1) {
                sPlayer = sPlayer.substring(0,sPlayer.lastIndexOf(',')) + ' und' + sPlayer.substring(sPlayer.lastIndexOf(',')+1,sPlayer.length);
            }
        };

        if (this.dbZocken[interaction.channel.id].length > 1) {
            returnValue = `${sPlayer} haben sich gefunden.`;
        } else {
            returnValue = `Leider hat sich niemand gefunden.`;
        };

        return returnValue;
    },

    hookForInteraction: async function(interaction)  {
        if (interaction.commandName == 'zocken') {
			if (this.dbZocken[interaction.channel.id]) {

				await interaction.reply({
					embeds: [ new MessageEmbed() 
                        .setColor('RED')
                        .setTitle('Fehler!')
                        .setDescription('Es gibt bereits eine aktive Zocken!-Anfrage in diesem Kanal. Bitte warte bis die vorherige Anfrage abgelaufen ist, bevor du eine neue erstellst.')
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
					content: `Hey${channelMemberPing} und alle anderen!`,
					embeds: [ e	],
					components: [ this.myActionRow ],
				});

				let collector = interaction.channel.createMessageComponentCollector({time: 1000*60*this.configCollectorTimeout});

				collector.on('collect', async i => {
					if (i.customId === 'zockenYes') {
						this.dbZocken[interaction.channel.id].includes(i.member.id) || this.dbZocken[interaction.channel.id].push(i.member.id);

						let e = await this.createZockenEmbed(interaction);

						await i.update({
							embeds: [ e	],
							components: [ this.myActionRow ],
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
							components: [ this.myActionRow ],
						});
					};
				});

				collector.on('end', async c => {
                    interaction.editReply({
                        content: await this.createZockenFinalString(interaction),
                        embeds: [ ],
                        components: [ ],
                    });
/*
                    if (c.size === 0) {
						interaction.deleteReply();
					} else {
						let e = await this.createZockenEmbed(interaction);
						e.setFooter('');

						await interaction.editReply({
							embeds: [ e	],
							components: [ ],
						});
					}
*/
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
                    statusZockenSelectText = 'Ping mich auch Offline.'
                    break;

                case 1:
                    statusZockenSelectText = 'Ping mich nur Online.'
                    break;

                case 0:
                    statusZockenSelectText = 'Ping mich bitte nicht.'
                    break;
            }

            await interaction.reply({
                embeds: [  new MessageEmbed()
                    .setColor('BLUE')
                    .setTitle('Warum steht da mein Name?')
                    .setDescription(`Es gibt mindestens ein Spiel, das ihr Beide in den letzten 100 Tagen gespielt habt. Falls du solche Benachrichtigungen nicht erhalten möchtest, kannst du das es hier ändern.\n\nDeine aktuelle Einstellung lautet:\n> ${statusZockenSelectText}`)
                ],
                components: [ new MessageActionRow()
                    .addComponents( new MessageSelectMenu()
                        .setCustomId('zockenSelected')
                        .setPlaceholder('Benachrichtigungen...')
                        .addOptions([
                            {
                                label: 'Ping mich auch Offline.',
                                description: 'Benachrichtigungen zum Zocken auch wenn ich nicht Online bin.',
                                value: '2',
                            },
                            {
                                label: 'Ping mich nur Online. (Standard)',
                                description: 'Benachrichtigungen zum Zocken falls ich Online bin.',
                                value: '1',
                            },
                            {
                                label: 'Ping mich bitte nicht.',
                                description: 'Ich habe kein Interesse an diesen Zocken-Anfragen.',
                                value: '0'
                            }
                        ]),
                    )
                ],
                ephemeral: true,
            });

            let collector = interaction.channel.createMessageComponentCollector({time: 1000*60*this.configCollectorTimeout});

            collector.on('collect', async i => {
                if (i.customId === 'zockenSelected') {
                    await this.client.myDB.Member.update(
                        { zockenmention: parseInt(i.values[0]) },
                        { where: {id: i.member.id} },
                    );
            
                    await i.update({
                        embeds: [ new MessageEmbed().setColor('GREEN').setTitle('Erfolgreich!').setDescription('Deine Benachrichtigungseinstellungen wurden gespeichert.') ],
                        components: [ ],
                    });
                };
            });

            collector.on('end', async c => {
                interaction.deleteReply();
            });
        };
    },
};

module.exports = myZocken;