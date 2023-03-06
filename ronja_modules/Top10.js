const { EmbedBuilder, Colors } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myTop10 = {
    defaultConfig: {
        top10CronKanal: null,       // please set in _SECRET/config.js
        top10Weekly: true,
        top10Monthly: true,
        top10Yearly: true,
    },

    createTop10Embed: async function (pDays = 14) {
        let maxgames = 10;

        let e = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(this.l('Most popular games!'))
        .setDescription(this.l('Most played games of the last %d days:', pDays));

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

        e.addFields([{ name: this.l('Top 10 by player count:'), value: s }]);
    
        return e;
    },

    postTop10ToChannel: async function(pDays, pDescription) {
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
    },

    hookForCommandInteraction: async function(interaction)  {
		if (interaction.commandName == 'top10') {
            await interaction.reply(this.client.myLoadingEmbed());

			this.createTop10Embed(interaction.options.getInteger('days') || 14)
            .then(e => {
                interaction.editReply({
                    embeds: [ e	],
                    ephemeral: true,
                });
            });
        }
    },

    hookForCron: function() {
        if (!this.cfg.top10CronKanal) {
            console.info('INFO: no top10CronKanal set in config file, disabling Top10-postings!')
            return [];
        }
        return [
            {
                schedule: '0 8 * * 1',
                action: () => {
                    if (this.cfg.top10Weekly) this.postTop10ToChannel(7, this.l('The most played games oft last week:'));
                },
            },
            {
                schedule: '0 7 1 * *',
                action: () => {
                    if (this.cfg.top10Monthly) this.postTop10ToChannel(30, this.l('The most played games of last month:'));
                },
            },
            {
                schedule: '0 0 1 1 *',
                action: () => {
                    if (this.cfg.top10Yearly) this.postTop10ToChannel(365, this.l('Happy new year! This have been the highlights of last year:'));
                },
            },
        ]
    },
};

module.exports = myTop10;