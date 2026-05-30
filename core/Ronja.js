const { Client, EmbedBuilder, Colors } = require("discord.js");
const Sequelize = require("sequelize");

const fs = require("node:fs");
const path = require("node:path");
const util = require("util");

class Ronja extends Client {
    db = {};
    myConfig = {};
    myLanguage = {};

    constructor(options) {
        super(options);

        let languagePath = __dirname;
        let languageFiles = fs
            .readdirSync(languagePath)
            .filter((file) => file.startsWith("language_"));

        for (let file of languageFiles) {
            let filePath = path.join(languagePath, file);
            let regexResult = filePath.match(new RegExp(/language_(.*)\.json/));

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
    }

    async myConfigUpdate() {
        let settings = await this.db.Setting.findAll();
        for (let setting of settings) {
            this.myConfig[setting.name] = setting.value;
        }
    }

    myConfigGet(name) {
        return this.myConfig[name] || null;
    }

    myConfigSet(name, value) {
        this.myConfig[name] = value;
        this.db.Setting.upsert({
            name: name,
            value: value,
        });
    }

    myTranslator() {
        if (this.myLanguage[arguments[0]] && this.myLanguage[arguments[0]][arguments[1]]) {
            arguments[1] =
                this.myLanguage[arguments[0]][arguments[1]][
                    Math.floor(Math.random() * this.myLanguage[arguments[0]][arguments[1]].length)
                ];
        } else {
            if (!this.myLanguage[arguments[0]]) this.myLanguage[arguments[0]] = {};
            this.myLanguage[arguments[0]][arguments[1]] = [arguments[1]];
            fs.writeFile(
                `./core/language_${arguments[0]}.json`,
                JSON.stringify(this.myLanguage[arguments[0]], null, 2),
                (err) => {
                    if (err) console.log("Error writing file:", err);
                }
            );
        }
        let params = Array.prototype.slice.call(arguments);
        params.shift();
        return util.format(...params);
    }

    async myReady() {
        await this.myConfigUpdate();
    }
}

module.exports = {
    Ronja,
};
