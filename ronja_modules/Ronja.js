const { Client, Intents, MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

class Ronja extends Client {
    mySeq = {};
    myDB = {};

    constructor(options) {
        super(options);
        
        this.mySeq = new Sequelize('database', 'user', 'password', {
            host: 'localhost',
            dialect: 'sqlite',
            logging: false,
            // SQLite only:
            storage: '_SECRET/database.sqlite',
        });

        this.myDB = {
            Games: this.mySeq.define('Games', {
                name: {
                    type: Sequelize.STRING,
                    unique: true,
                },
                channel: {
                    type: Sequelize.STRING,
                    defaultValue: null,
                    allowNull: true,
                }, 
            }),
        
            GamesPlayed: this.mySeq.define('GamesPlayed', {
                member: Sequelize.STRING,
                lastplayed: Sequelize.DATE,
            }),
        
            Member: this.mySeq.define('Member', {
                zockenmention: {
                    type: Sequelize.TINYINT,
                    defaultValue: 1,
                }
            }),
        };
        
        this.myDB.Games.hasMany(this.myDB.GamesPlayed);
        this.myDB.GamesPlayed.belongsTo(this.myDB.Games);
    };

    mySetGameAsChannelName(ch) {
        if (ch.isVoice() && ch.userLimit === 0) {
            let Spiele = {};
            let MaxSpiel = null;
            let CountSpiel = 0;
    
            ch.members.forEach(m => {
                if (m.presence) m.presence.activities.forEach(a => {
                    if (a.type === 'PLAYING') Spiele[a.name] = (Spiele[a.name] || 0) + 1;
                });
            });
            Object.entries(Spiele).forEach(e => {
                let [key, value] = e;
                if (value > CountSpiel) {
                    CountSpiel = value;
                    MaxSpiel = key;
                }
            })
            ch.setName(MaxSpiel || 'Ei Gude!');
        }
    };
    
};

module.exports = {
    Ronja,
}
