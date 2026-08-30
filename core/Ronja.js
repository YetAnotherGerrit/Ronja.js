const { Client, EmbedBuilder, Colors, REST, Routes } = require("discord.js");
const Sequelize = require("sequelize");

const fs = require("node:fs");
const path = require("node:path");
const util = require("util");
const crypto = require("node:crypto");

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

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

    async myReady(modules = []) {
        await this.myConfigUpdate();
        await this.myDeployCommands(modules);
    }

    async myDeployCommands(modules) {
        const rest = new REST({ version: "10" }).setToken(this.token);
        const appId = this.application.id;

        const desired = modules.flatMap((m) => m.commands || []).map((c) => c.toJSON());
        const existing = await this.db.Command.findAll();
        const existingByKey = new Map(existing.map((c) => [`${c.name}:${c.type}`, c]));
        const seen = new Set();

        for (const json of desired) {
            const key = `${json.name}:${json.type}`;
            seen.add(key);
            const hash = crypto.createHash("sha256").update(stableStringify(json)).digest("hex");
            const row = existingByKey.get(key);

            if (!row) {
                const created = await rest.post(Routes.applicationCommands(appId), {
                    body: json,
                });
                await this.db.Command.create({
                    name: json.name,
                    type: json.type,
                    discordId: created.id,
                    hash,
                });
                console.log(`Deployed new command: ${json.name}`);
            } else if (row.hash !== hash) {
                await rest.patch(Routes.applicationCommand(appId, row.discordId), {
                    body: json,
                });
                await row.update({ hash });
                console.log(`Updated command: ${json.name}`);
            }
        }

        for (const row of existing) {
            if (!seen.has(`${row.name}:${row.type}`)) {
                await rest.delete(Routes.applicationCommand(appId, row.discordId));
                await row.destroy();
                console.log(`Removed obsolete command: ${row.name}`);
            }
        }
    }
}

module.exports = {
    Ronja,
};
