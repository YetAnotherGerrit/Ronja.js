const { Client } = require('discord.js');
const Sequelize = require('sequelize');

const mySECRET = require('../_SECRET/config.js');

class Ronja extends Client {
    mySeq = {};
    myDB = {};
    myConfig = {};

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

        this.myConfig = mySECRET;
    };

    myReady() {
        this.myDB.Games.sync();
        this.myDB.GamesPlayed.sync();
        this.myDB.Member.sync();
    };
    
};

module.exports = {
    Ronja,
}
