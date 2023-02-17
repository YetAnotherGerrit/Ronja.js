const { EmbedBuilder, Colors } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myTop10 = {
    defaultConfig: {
        top10CronKanal: null,       // please set in _SECRET/config.js
    },

    createTop10Embed: async function (pDays = 14) {
        let maxgames = 10;

        let e = new EmbedBuilder()
        .setColor(Colors.Blue)
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

        e.addFields([{ name: 'Top10 nach Spieleranzahl:', value: s }]);
    
        return e;
    },

    postTop10ToChannel: async function(pDays, pDescription) {
        if (this.cfg.top10CronKanal) {
            this.client.channels.fetch(this.cfg.top10CronKanal)
            .then(c => {
                this.createTop10Embed(pDays)
                .then(e => {
                    e.setDescription(pDescription)
                    c.send({embeds: [e]});
                })
                .catch(console.error);
            })
            .catch(console.error);
        } else {
            console.warn('WARNING: no top10CronKanal set in config file!')
        }
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
                    this.postTop10ToChannel(7, 'Einen guten Start in die neue Woche! Das waren die beliebtesten Spiele der letzten Woche:');
                },
            },
            {
                schedule: '0 7 1 * *',
                action: () => {
                    this.postTop10ToChannel(30, 'Schauen wir doch mal, was letzten Monat bei der Liga so angesagt war:');
                },
            },
            {
                schedule: '0 0 1 1 *',
                action: () => {
                    this.postTop10ToChannel(365, 'Frohes neues Jahr! Das waren die Highlights des letzten Jahres:');
                },
            },
        ]
    },
};

module.exports = myTop10;