const { MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myTop10 = {
    client: null,

    init: function(client) {this.client = client},

    createTop10Embed: async function (pDays = 14) {
        let maxgames = 10;

        let e = new MessageEmbed()
        .setColor('BLUE')
        .setTitle(`Die beliebtesten Spiele der Liga!`)
        .setDescription(`Die meistgespielten Spiele der letzten ${pDays} Tage:`);

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
                        lastplayed: {
                            [Op.gte]: Moment().subtract(pDays,'days')
                        }
                    },
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
                s = s.concat('**',gg.cName,'**  :busts_in_silhouette:  ',gg.name,'\n');
                maxgames = maxgames - 1;
            }
        });

        e.addField('Top10 nach Spieleranzahl:',s);
    
        return e;
    },

    postTop10ToChannel: async function(pChannelID, pDays, pDescription) {
        this.client.channels.fetch(pChannelID)
        .then(c => {
            this.createTop10Embed(pDays)
            .then(e => {
                e.setDescription(pDescription)
                c.send({embeds: [e]});
            })
            .catch(console.error);
        })
        .catch(console.error);
    },

    hookForInteraction: async function(interaction)  {
		if (interaction.commandName == 'top10') {
			let e = await this.createTop10Embed(interaction.options.getInteger('tage') || 14);

			await interaction.reply({
				embeds: [ e	],
				ephemeral: true,
			});
        };
    },

    hookForCron: function() {
        return [
            {
                schedule: '0 8 * * 1',
                action: () => {
                    this.postTop10ToChannel(this.client.myConfig.CronKanal, 7, 'Einen guten Start in die neue Woche! Das waren die beliebtesten Spiele der letzten Woche:');
                },
            },
            {
                schedule: '0 7 1 * *',
                action: () => {
                    this.postTop10ToChannel(this.client.myConfig.CronKanal, 30, 'Schauen wir doch mal, was letzten Monat bei der Liga so angesagt war:');
                },
            },
            {
                schedule: '0 0 1 1 *',
                action: () => {
                    this.postTop10ToChannel(this.client.myConfig.CronKanal, 365, 'Frohes neues Jahr! Das waren die Highlights des letzten Jahres:');
                },
            },
        ]
    },
};

module.exports = myTop10;