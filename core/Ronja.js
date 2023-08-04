const { Client, EmbedBuilder, Colors } = require('discord.js');
const Sequelize = require('sequelize');

const mySECRET = require('../_SECRET/config.js');

const fs = require('node:fs');
const path = require('node:path');
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

        let languagePath = __dirname;
        let languageFiles = fs.readdirSync(languagePath).filter(file => file.startsWith('language_'));
        
        for (let file of languageFiles) {
            let filePath = path.join(languagePath, file);
            let regexResult = filePath.match(new RegExp(/language\_(.*)\.json/));

            if (regexResult) {
                fs.readFile(filePath, "utf8", (err, jsonString) => {
                    if (err) {
                      console.log("Error reading file from disk:", err);
                      return;
                    }
                    try {
                      this.myLanguage[regexResult[1]] = JSON.parse(jsonString);
                    } catch (err) {
                      console.log("Error parsing JSON string:", err);
                    }
                });
            }

        }




    };

    myTranslator() {
        if (this.myLanguage[arguments[0]] && this.myLanguage[arguments[0]][arguments[1]]) {
            arguments[1] = this.myLanguage[arguments[0]][arguments[1]][Math.floor(Math.random() * this.myLanguage[arguments[0]][arguments[1]].length)];
        } else {
            if (!this.myLanguage[arguments[0]]) this.myLanguage[arguments[0]] = {};
            this.myLanguage[arguments[0]][arguments[1]] = [arguments[1]];
            fs.writeFile(`./core/language_${arguments[0]}.json`, JSON.stringify(this.myLanguage[arguments[0]], null, 2), err => {
                if (err) console.log("Error writing file:", err);
            });            
        }
        let params = Array.prototype.slice.call(arguments);
        params.shift();
        return util.format(...params);
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
