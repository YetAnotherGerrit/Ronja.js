const { EmbedBuilder, Colors } = require('discord.js');

// Database dependencies
const Sequelize = require('sequelize');

// Parameters for Datetime-Formating of toLocaleDateString
// TODO: Move somewhere else
const toLocaleDateStringCountry = 'de-DE';
const toLocaleDateStringFormat = { year: 'numeric', month: '2-digit', day: '2-digit' };

const myServerprofil = {
    hookForContextMenuInteraction: async function(interaction)  {
        if (interaction.commandName == 'Serverprofil') {
            let m = await interaction.guild.members.fetch(interaction.options.getUser('user').id);

            let e = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(this.l('Profile of %s', m.displayName))
            .setThumbnail(m.displayAvatarURL())
            .setDescription(this.l(`%s is on this discord server since %s.`, m.displayName, m.joinedAt.toLocaleDateString(toLocaleDateStringCountry, toLocaleDateStringFormat)));
    
            if (interaction.member != m) {
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
                                member: [interaction.member.id,m.id]
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
                        s = s.concat(gg.name,'\n');
                    }
                });
    
                if (s != '') {
                     e.addFields([{name: this.l('Common games'), value: s}]);
                 };
            };
    
            await interaction.reply({
                embeds: [ e	],
                ephemeral: true,
            });
    
        };
    },

};

module.exports = myServerprofil;