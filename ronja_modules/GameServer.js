const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    MessageFlags,
    PermissionFlagsBits,
    RESTJSONErrorCodes,
    channelMention,
} = require("discord.js");
const { GameDig, games } = require("gamedig");
const { DateTime } = require("luxon");
const { Op } = require("sequelize");
const {
    gameType,
    gameTypesFor,
    gameTypeLabel,
    connectAddress,
    statusLine,
} = require("../core/gameServer.js");

// A server only counts as offline after this many failed checks in a row,
// so a single lost packet doesn't cause a false alarm.
const FAILURES_FOR_OFFLINE = 2;
// Discord allows 2 name or topic edits per channel every 10 minutes.
const TOPIC_EDITS_PER_WINDOW = 2;
const TOPIC_EDIT_WINDOW_MS = 10 * 60 * 1000;
const CHOICES_LIMIT = 25; // Discord's limit for autocomplete choices.
const LIST_MAX_LENGTH = 4000; // Below Discord's 4096 for an embed description.
const PERMISSION_ERRORS = [RESTJSONErrorCodes.MissingPermissions, RESTJSONErrorCodes.MissingAccess];

// /gameserver: the game server of a game text channel, checked every 5
// minutes via GameDig while the channel is active. Its status is kept in the
// channel topic (just the connect address while archived), and Ronja posts
// when it goes offline or comes back - if someone played the game recently.
const myGameServer = {
    // channel id -> timestamps of Ronja's recent topic edits there
    topicEdits: new Map(),
    // "<channel id>:topic|post" - permission problems the owner was told about
    // already, so they don't get a DM every 5 minutes.
    ownerNotified: new Set(),

    commands: [
        new SlashCommandBuilder()
            .setName("gameserver")
            .setNameLocalizations({ de: "spielserver" })
            .setDescription("Set up or remove the game server of this game's text channel.")
            .setDescriptionLocalizations({
                de: "Richte den Spielserver dieses Spiel-Textkanals ein oder entferne ihn.",
            })
            .addSubcommand((subcommand) =>
                subcommand
                    .setName("set")
                    .setNameLocalizations({ de: "festlegen" })
                    .setDescription("Show this game server's status in the channel topic.")
                    .setDescriptionLocalizations({
                        de: "Zeigt den Status dieses Spielservers im Kanalthema.",
                    })
                    .addStringOption((option) =>
                        option
                            .setName("game")
                            .setNameLocalizations({ de: "spiel" })
                            .setDescription("The game the server runs.")
                            .setDescriptionLocalizations({
                                de: "Das Spiel, das auf dem Server läuft.",
                            })
                            .setRequired(true)
                            .setAutocomplete(true)
                    )
                    .addStringOption((option) =>
                        option
                            .setName("address")
                            .setNameLocalizations({ de: "adresse" })
                            .setDescription("The address Ronja checks the server at.")
                            .setDescriptionLocalizations({
                                de: "Die Adresse, unter der Ronja den Server prüft.",
                            })
                            .setRequired(true)
                            .setMaxLength(200)
                    )
                    .addIntegerOption((option) =>
                        option
                            .setName("port")
                            .setNameLocalizations({ de: "port" })
                            .setDescription("The server's port. Default: the game's usual port.")
                            .setDescriptionLocalizations({
                                de: "Der Port des Servers. Standard: der übliche Port des Spiels.",
                            })
                            .setMinValue(1)
                            .setMaxValue(65535)
                    )
                    .addStringOption((option) =>
                        option
                            .setName("connect-address")
                            .setNameLocalizations({ de: "verbindungsadresse" })
                            .setDescription(
                                "The address members connect to, if it's not the one above."
                            )
                            .setDescriptionLocalizations({
                                de: "Die Adresse, mit der sich Mitglieder verbinden, falls nicht die obige.",
                            })
                            .setMaxLength(200)
                    )
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName("remove")
                    .setNameLocalizations({ de: "entfernen" })
                    .setDescription("Remove this channel's game server.")
                    .setDescriptionLocalizations({
                        de: "Entfernt den Spielserver dieses Kanals.",
                    })
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false),
    ],

    isArchived: function (channel) {
        let archive = this.cfg("dtcArchivedGamesCategory");
        return Boolean(archive) && channel.parentId === archive;
    },

    // The game whose text channel the interaction is in (threads count
    // towards their channel) - or null.
    interactionGame: async function (interaction) {
        let channel = interaction.channel?.isThread()
            ? interaction.channel.parentId
            : interaction.channelId;
        return await this.client.db.Game.findOne({ where: { channel } });
    },

    // The game types to pick from: the channel's game's own first, then
    // every type whose id or name contains what was typed so far.
    hookForAutocompleteInteraction: async function (interaction) {
        if (interaction.commandName !== "gameserver") return;

        let text = interaction.options.getFocused().trim().toLowerCase();
        let game = await this.interactionGame(interaction);
        let own = game ? gameTypesFor(game.name) : [];
        let matching = Object.keys(games)
            .filter(
                (id) =>
                    !own.includes(id) &&
                    (id.includes(text) || games[id].name.toLowerCase().includes(text))
            )
            .sort((a, b) => games[a].name.localeCompare(games[b].name));

        await interaction.respond(
            [...own, ...matching]
                .slice(0, CHOICES_LIMIT)
                .map((id) => ({ name: gameTypeLabel(id).slice(0, 100), value: id }))
        );
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "gameserver") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let set = interaction.options.getSubcommand() === "set";
        let game = await this.interactionGame(interaction);
        if (!game) {
            await (set ? this.suggestChannels(interaction) : this.listServers(interaction));
            return;
        }

        let channel = await this.client.channels.fetch(game.channel);
        await (set
            ? this.setServer(interaction, channel)
            : this.removeServer(interaction, channel));
    },

    reply: async function (interaction, color, description, title) {
        let embed = new EmbedBuilder().setColor(color).setDescription(description);
        if (title) embed.setTitle(title);
        await interaction.editReply({ embeds: [embed] });
    },

    // Outside a game text channel: the active ones whose game GameDig knows.
    suggestChannels: async function (interaction) {
        let locale = interaction.locale;
        let lines = [];
        let channelGames = await this.client.db.Game.findAll({
            where: { channel: { [Op.ne]: null } },
            order: [["name", "ASC"]],
        });
        for (let game of channelGames) {
            let types = gameTypesFor(game.name);
            if (!types.length) continue;
            let channel = await interaction.guild.channels.fetch(game.channel).catch(() => null);
            if (!channel || this.isArchived(channel)) continue;
            lines.push(`${channelMention(channel.id)} · ${types.map(gameTypeLabel).join(", ")}`);
        }

        let title = this.l(locale, "/gameserver only works in a game's text channel");
        if (!lines.length) {
            await this.reply(
                interaction,
                Colors.Blue,
                this.l(
                    locale,
                    "None of the active game channels is for a game I know how to check. You can still run /gameserver in any game's text channel and pick the game yourself."
                ),
                title
            );
            return;
        }
        await this.reply(
            interaction,
            Colors.Blue,
            this.listText(
                this.l(locale, "Run it in one of these channels, whose games I can check:"),
                lines
            ),
            title
        );
    },

    // Outside a game text channel: the channels that have a game server.
    listServers: async function (interaction) {
        let locale = interaction.locale;
        let servers = await this.client.db.GameServer.findAll();
        let title = this.l(locale, "/gameserver only works in a game's text channel");
        if (!servers.length) {
            await this.reply(
                interaction,
                Colors.Blue,
                this.l(locale, "No game channel has a game server set up."),
                title
            );
            return;
        }
        await this.reply(
            interaction,
            Colors.Blue,
            this.listText(
                this.l(locale, "Run it in the channel whose game server you want to remove:"),
                servers.map(
                    (s) =>
                        `${channelMention(s.channel)} · ${gameTypeLabel(s.type)} · ${connectAddress(s)}`
                )
            ),
            title
        );
    },

    // `intro` and as many `lines` as fit into an embed description.
    listText: function (intro, lines) {
        let text = intro;
        for (let line of lines) {
            if (text.length + line.length + 1 > LIST_MAX_LENGTH) break;
            text += `\n${line}`;
        }
        return text;
    },

    setServer: async function (interaction, channel) {
        let locale = interaction.locale;
        // A game type picked from the autocomplete - or a game's name, typed
        // without picking one.
        let type = interaction.options.getString("game").trim();
        if (!gameType(type)) type = gameTypesFor(type)[0] ?? type;
        if (!gameType(type)) {
            await this.reply(
                interaction,
                Colors.Red,
                this.l(
                    locale,
                    "I don't know how to check a server of %s. Please pick a game from the list.",
                    type
                )
            );
            return;
        }
        let port = interaction.options.getInteger("port") ?? gameType(type).options?.port;
        if (!port) {
            await this.reply(
                interaction,
                Colors.Red,
                this.l(
                    locale,
                    "%s has no usual port, please enter the server's port.",
                    gameTypeLabel(type)
                )
            );
            return;
        }

        let values = {
            type,
            host: interaction.options.getString("address").trim(),
            port,
            connectAddress: interaction.options.getString("connect-address")?.trim() || null,
            online: null,
            failures: 0,
            players: null,
            maxPlayers: null,
            checkedAt: null,
        };
        let archived = this.isArchived(channel);
        // Checked right away, so the admin sees whether the address works.
        let status = archived ? null : await this.query(values);
        if (status) Object.assign(values, { online: true, ...status });
        else if (!archived) values.failures = 1;
        if (!archived) values.checkedAt = new Date();

        let [server] = await this.client.myFindOrCreate(this.client.db.GameServer, {
            where: { channel: channel.id },
            defaults: values,
        });
        await server.update(values);

        let result = archived
            ? this.l(
                  locale,
                  "This channel is archived, so I'll only start checking the server once it's reactivated."
              )
            : status
              ? this.l(
                    locale,
                    "The server answered: %s.",
                    statusLine((...a) => this.l(locale, ...a), server)
                )
              : this.l(
                    locale,
                    "The server didn't answer just now. If it doesn't answer the next check either, it's shown as offline."
                );
        await this.reply(
            interaction,
            Colors.Green,
            `${this.l(
                locale,
                "I'll check the %s server at %s every 5 minutes and show its status in this channel's topic.",
                gameTypeLabel(type),
                `${server.host}:${server.port}`
            )}\n\n${result}`,
            this.l(locale, "Game server saved")
        );

        console.log(`Set up the ${type} server ${server.host}:${server.port} in #${channel.name}.`);
        await this.updateTopic(channel, server, true);
    },

    removeServer: async function (interaction, channel) {
        let locale = interaction.locale;
        let server = await this.client.db.GameServer.findOne({ where: { channel: channel.id } });
        if (!server) {
            await this.reply(
                interaction,
                Colors.Blue,
                this.l(locale, "This channel has no game server set up.")
            );
            return;
        }

        await server.destroy();
        await this.reply(
            interaction,
            Colors.Green,
            this.l(
                locale,
                "I removed the game server %s and won't check it anymore. I'm clearing this channel's topic.",
                connectAddress(server)
            ),
            this.l(locale, "Game server removed")
        );

        console.log(`Removed the game server ${server.host}:${server.port} from #${channel.name}.`);
        if (channel.topic) await this.editTopic(channel, "", true);
    },

    // Asks the server for its status: { players, maxPlayers } - or null if
    // it didn't answer. Only logged until it's known to be offline, not every
    // 5 minutes for as long as it stays down.
    query: async function (server) {
        try {
            let state = await GameDig.query({
                type: server.type,
                host: server.host,
                port: server.port,
            });
            return {
                players: state.numplayers ?? state.players.length,
                maxPlayers: state.maxplayers || null,
            };
        } catch (err) {
            if (server.online === false) return null;
            console.log(
                `The ${server.type} server ${server.host}:${server.port} didn't answer: ${err.message}`
            );
            return null;
        }
    },

    checkServer: async function (server) {
        let channel;
        try {
            channel = await this.client.channels.fetch(server.channel);
        } catch (err) {
            if (err.code !== RESTJSONErrorCodes.UnknownChannel) throw err;
            // Deleted while Ronja was offline, so hookForChannelDelete never ran.
            await server.destroy();
            console.log(`Removed the game server of deleted channel ${server.channel}.`);
            return;
        }

        // Not checked while archived. Its last status would be outdated by
        // the time the channel is reactivated, so the first check after that
        // starts over, like the first check of a new server.
        if (this.isArchived(channel)) {
            if (server.online !== null || server.failures) {
                await server.update({ online: null, failures: 0, players: null, maxPlayers: null });
            }
            await this.updateTopic(channel, server);
            return;
        }

        let wasOnline = server.online;
        let status = await this.query(server);
        if (status) {
            await server.update({ online: true, failures: 0, ...status, checkedAt: new Date() });
            if (wasOnline === false) await this.announce(channel, server);
        } else {
            let failures = server.failures + 1;
            let offline = failures >= FAILURES_FOR_OFFLINE;
            await server.update({
                failures,
                checkedAt: new Date(),
                ...(offline ? { online: false, players: null, maxPlayers: null } : {}),
            });
            if (offline && wasOnline === true) await this.announce(channel, server);
        }
        await this.updateTopic(channel, server);
    },

    // Posts that the server went offline or came back online, if someone
    // played the game within the gameServerPostDays setting's days.
    announce: async function (channel, server) {
        let what = server.online ? "back online" : "offline";
        let game = await this.client.db.Game.findOne({ where: { channel: channel.id } });
        let days = Number(this.cfg("gameServerPostDays") ?? 7);
        let played = game
            ? await this.client.db.GameStatus.count({
                  where: {
                      GameId: game.id,
                      lastplayed: {
                          [Op.gte]: DateTime.now()
                              .setZone(this.cfg("timezone"))
                              .minus({ days })
                              .toJSDate(),
                      },
                  },
              })
            : 0;
        if (!played) {
            console.log(`The game server in #${channel.name} is ${what}, nobody played recently.`);
            return;
        }

        let locale = channel.guild.preferredLocale;
        let l = (...args) => this.l(locale, ...args);
        let embed = new EmbedBuilder().setColor(Colors.Blue);
        if (server.online) {
            embed
                .setTitle(`🟢 ${l("The game server is back online")}`)
                .setDescription(
                    l("%s is answering again: %s.", connectAddress(server), statusLine(l, server))
                );
        } else {
            embed
                .setTitle(`🔴 ${l("The game server is offline")}`)
                .setDescription(
                    l(
                        "%s isn't answering anymore. I'll let you know when it's back.",
                        connectAddress(server)
                    )
                );
        }

        try {
            await channel.send({ embeds: [embed] });
            this.ownerNotified.delete(`${channel.id}:post`);
            console.log(`Posted in #${channel.name} that its game server is ${what}.`);
        } catch (err) {
            let message = l(
                "Could not post the game server status in #%s: I need the Send Messages and Embed Links permissions there.",
                channel.name
            );
            if (!this.notifyOwnerOnce(channel, "post", err, message)) {
                console.error(`Could not post the game server status in #${channel.name}:`, err);
            }
        }
    },

    // The topic the server's channel should have: its status and connect
    // address - or only the address while the channel is archived.
    updateTopic: async function (channel, server, force = false) {
        let topic = connectAddress(server);
        if (!this.isArchived(channel)) {
            let l = (...args) => this.l(channel.guild.preferredLocale, ...args);
            topic = `${statusLine(l, server)} · ${topic}`;
        }
        if ((channel.topic ?? "") === topic) return;
        await this.editTopic(channel, topic, force);
    },

    // Skips the edit if Discord's limit for the channel is used up - the next
    // check tries again. `force` (for admin changes) edits anyway: discord.js
    // then waits until Discord allows it.
    editTopic: async function (channel, topic, force = false) {
        let now = Date.now();
        let edits = (this.topicEdits.get(channel.id) ?? []).filter(
            (t) => now - t < TOPIC_EDIT_WINDOW_MS
        );
        if (!force && edits.length >= TOPIC_EDITS_PER_WINDOW) {
            this.topicEdits.set(channel.id, edits);
            return;
        }
        this.topicEdits.set(channel.id, [...edits, now]);

        try {
            await channel.setTopic(topic);
            this.ownerNotified.delete(`${channel.id}:topic`);
        } catch (err) {
            let message = this.l(
                channel.guild.preferredLocale,
                "Could not show the game server status in the topic of #%s: I need the Manage Channels permission there.",
                channel.name
            );
            if (!this.notifyOwnerOnce(channel, "topic", err, message)) {
                console.error(`Could not update the topic of #${channel.name}:`, err);
            }
        }
    },

    // Like client.myNotifyOwnerOnPermissionError, but only once per channel
    // and `kind` until it works again - checks retry every 5 minutes.
    notifyOwnerOnce: function (channel, kind, err, message) {
        let key = `${channel.id}:${kind}`;
        if (this.ownerNotified.has(key)) return PERMISSION_ERRORS.includes(err?.code);
        if (!this.client.myNotifyOwnerOnPermissionError(channel.guild, err, message)) return false;
        this.ownerNotified.add(key);
        return true;
    },

    hookForChannelDelete: async function (channel) {
        let removed = await this.client.db.GameServer.destroy({ where: { channel: channel.id } });
        if (removed) console.log(`Removed the game server of deleted channel #${channel.name}.`);
    },

    hookForCron: function () {
        return [
            {
                schedule: "*/5 * * * *", // https://crontab.guru/
                action: async () => {
                    let servers = await this.client.db.GameServer.findAll();
                    await Promise.all(
                        servers.map((server) =>
                            this.checkServer(server).catch((err) =>
                                console.error(
                                    `Could not check the game server in channel ${server.channel}:`,
                                    err
                                )
                            )
                        )
                    );
                },
            },
        ];
    },
};

module.exports = myGameServer;
