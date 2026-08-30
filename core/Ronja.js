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

    async myNotifyOwner(guild, message) {
        console.error(message);
        try {
            let owner = await guild.fetchOwner();
            await owner.send(message);
        } catch (err) {
            console.error(`Could not DM the guild owner: ${err}`);
        }
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

        // discord.js only sets `type` explicitly for context-menu commands; chat-input
        // commands come back as `undefined` here but as `1` from Discord's API. Normalize
        // so keys derived from our own definitions match keys derived from live commands.
        const desired = modules
            .flatMap((m) => m.commands || [])
            .map((c) => c.toJSON())
            .map((json) => ({ ...json, type: json.type ?? 1 }));
        const desiredByKey = new Map(desired.map((json) => [`${json.name}:${json.type}`, json]));

        // Discord's actual command list is the source of truth for what's registered and
        // under which ID(s) — the local Command table is only a hash cache to skip
        // redundant PATCH calls, so it can never cause commands to be silently duplicated
        // or leaked if it ever falls out of sync with Discord (e.g. a fresh Command table
        // deployed against an application that already had commands registered another way).
        const live = await rest.get(Routes.applicationCommands(appId));
        const liveByKey = new Map();
        for (const cmd of live) {
            const key = `${cmd.name}:${cmd.type}`;
            if (!liveByKey.has(key)) liveByKey.set(key, []);
            liveByKey.get(key).push(cmd);
        }

        const tracked = await this.db.Command.findAll();
        const trackedByKey = new Map(tracked.map((c) => [`${c.name}:${c.type}`, c]));

        for (const [key, json] of desiredByKey) {
            const hash = crypto.createHash("sha256").update(stableStringify(json)).digest("hex");
            const row = trackedByKey.get(key);
            const matches = (liveByKey.get(key) || []).sort((a, b) =>
                BigInt(a.id) < BigInt(b.id) ? -1 : 1
            );

            if (matches.length === 0) {
                const created = await rest.post(Routes.applicationCommands(appId), {
                    body: json,
                });
                if (row) await row.update({ discordId: created.id, hash });
                else
                    await this.db.Command.create({
                        name: json.name,
                        type: json.type,
                        discordId: created.id,
                        hash,
                    });
                console.log(`Deployed new command: ${json.name}`);
                continue;
            }

            // Keep the oldest registration, drop any duplicates (e.g. leftovers from a
            // previous deployment method that this table never knew about).
            const [canonical, ...duplicates] = matches;
            for (const dupe of duplicates) {
                await rest.delete(Routes.applicationCommand(appId, dupe.id));
                console.log(`Removed duplicate command: ${json.name} (${dupe.id})`);
            }

            if (!row || row.hash !== hash) {
                await rest.patch(Routes.applicationCommand(appId, canonical.id), {
                    body: json,
                });
                console.log(`Updated command: ${json.name}`);
            }

            if (row) await row.update({ discordId: canonical.id, hash });
            else
                await this.db.Command.create({
                    name: json.name,
                    type: json.type,
                    discordId: canonical.id,
                    hash,
                });
        }

        for (const [key, matches] of liveByKey) {
            if (!desiredByKey.has(key)) {
                for (const cmd of matches) {
                    await rest.delete(Routes.applicationCommand(appId, cmd.id));
                    console.log(`Removed obsolete command: ${cmd.name}`);
                }
            }
        }

        for (const row of tracked) {
            if (!desiredByKey.has(`${row.name}:${row.type}`)) {
                await row.destroy();
            }
        }

        // Ronja only ever registers global commands. Older versions of the pre-2.0
        // deploy-commands.js script registered guild-specific commands instead (switched to
        // global in commit b4c8604), and those were never cleared when that script changed
        // over — they'd otherwise sit alongside the global ones and show up as duplicates in
        // Discord's UI. Unconditional and cheap to repeat: a no-op once a guild is already clear.
        for (const guild of this.guilds.cache.values()) {
            const guildCommands = await rest.get(Routes.applicationGuildCommands(appId, guild.id));
            if (guildCommands.length > 0) {
                await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: [] });
                console.log(
                    `Removed ${guildCommands.length} legacy guild-specific command(s) from ${guild.name}.`
                );
            }
        }
    }
}

module.exports = {
    Ronja,
};
