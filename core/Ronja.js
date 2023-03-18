const { Client, EmbedBuilder, Colors } = require('discord.js');
const Sequelize = require('sequelize');

const mySECRET = require('../_SECRET/config.js');

const fs = require('fs');
const util = require('util');

class Ronja extends Client {
    mySeq = {};
    myDB = {};
    myConfig = {};
    myLanguage = {};

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

        if (fs.existsSync(`./_SECRET/language_${this.myConfig.language}.json`)) fs.readFile(`./_SECRET/language_${this.myConfig.language}.json`, "utf8", (err, jsonString) => {
            if (err) {
              console.log("Error reading file from disk:", err);
              return;
            }
            try {
              this.myLanguage = JSON.parse(jsonString);
            } catch (err) {
              console.log("Error parsing JSON string:", err);
            }
        });

    };

    myTranslator() {
        if (this.myLanguage[arguments[0]]) {
            arguments[0] = this.myLanguage[arguments[0]][Math.floor(Math.random() * this.myLanguage[arguments[0]].length)];
        } else {
            this.myLanguage[arguments[0]] = [arguments[0]];
            fs.writeFile(`./_SECRET/language_${this.myConfig.language}.json`, JSON.stringify(this.myLanguage, null, 2), err => {
                if (err) console.log("Error writing file:", err);
            });            
        }
        return util.format(...arguments);
    };

    // Run with "false" if no ephemeral.
    myLoadingEmbed(myEphemeral = true) {
        return {
            embeds: [
                new EmbedBuilder()
                .setColor(Colors.Grey)
                .setTitle(this.myTranslator('Loading...'))
                .setDescription(this.myTranslator('Please be patient.'))
            ],
            ephemeral: myEphemeral,
        }
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
