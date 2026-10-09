const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    MessageFlags,
    PermissionFlagsBits,
    RESTJSONErrorCodes,
    ActionRowBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    TimestampStyles,
    channelMention,
    time,
} = require("discord.js");
const { GameDig } = require("gamedig");
const { DateTime } = require("luxon");
const { Op } = require("sequelize");
const {
    gameType,
    gameTypesFor,
    findGameTypes,
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
// The buttons work until shortly before the reply's interaction token expires.
const COLLECTOR_TIMEOUT_MS = 14 * 60 * 1000;
const FIELD_MAX_LENGTH = 1024; // Discord's limit for an embed field value.
const AMBIGUOUS_SHOWN = 10;
const GAMES_LIST_URL = "https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md";
const PERMISSION_ERRORS = [RESTJSONErrorCodes.MissingPermissions, RESTJSONErrorCodes.MissingAccess];

const SETUP_ID = "gameserverSetup";
const REMOVE_ID = "gameserverRemove";
const MODAL_ID = "gameserverModal";

// /gameserver: the game server of a game text channel, checked every 5
// minutes via GameDig while the channel is active. Its status is kept in the
// channel topic (just the connect address while archived), and Ronja posts
// when it goes offline or comes back - if someone played the game recently.
// In a game text channel, /gameserver shows its server with buttons to set
// it up, update or remove it; anywhere else, the channels that have one or
// could have one.
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
            .setDescription("Show, set up or remove the game server of this game's text channel.")
            .setDescriptionLocalizations({
                de: "Zeige, richte ein oder entferne den Spielserver dieses Spiel-Textkanals.",
            })
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

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "gameserver") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let game = await this.interactionGame(interaction);
        if (!game) {
            await interaction.editReply(
                await this.renderList(interaction.guild, interaction.locale)
            );
            return;
        }

        let channel = await this.client.channels.fetch(game.channel);
        // What the admin entered last, to fill the form in again if it was invalid.
        let state = { input: null };
        let message = await interaction.editReply(
            await this.renderView(channel, game, interaction.locale)
        );

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: COLLECTOR_TIMEOUT_MS,
        });
        collector.on("collect", async (i) => {
            try {
                if (i.customId === SETUP_ID)
                    await this.handleSetup(interaction, i, channel, game, state);
                if (i.customId === REMOVE_ID)
                    await this.handleRemove(interaction, i, channel, game);
            } catch (err) {
                console.error("Error handling a /gameserver button:", err);
            }
        });
        collector.on("end", async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch {
                // The ephemeral message may already be gone (e.g. dismissed by the admin).
            }
        });
    },

    // Outside a game text channel: the channels with a game server, and the
    // active ones without one whose game GameDig knows.
    renderList: async function (guild, locale) {
        let l = (...args) => this.l(locale, ...args);
        let servers = await this.client.db.GameServer.findAll();
        let withServer = new Set(servers.map((s) => s.channel));

        let setUp = [];
        for (let server of servers) {
            let channel = await guild.channels.fetch(server.channel).catch(() => null);
            if (!channel) continue;
            let status = this.isArchived(channel)
                ? l("Not checked while archived")
                : statusLine(l, server);
            setUp.push(`${channelMention(channel.id)} · ${gameTypeLabel(server.type)} · ${status}`);
        }

        let possible = [];
        let channelGames = await this.client.db.Game.findAll({
            where: { channel: { [Op.ne]: null } },
            order: [["name", "ASC"]],
        });
        for (let game of channelGames) {
            if (withServer.has(game.channel)) continue;
            let types = gameTypesFor(game.name);
            if (!types.length) continue;
            let channel = await guild.channels.fetch(game.channel).catch(() => null);
            if (!channel || this.isArchived(channel)) continue;
            possible.push(`${channelMention(channel.id)} · ${types.map(gameTypeLabel).join(", ")}`);
        }

        let embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(l("Game servers"))
            .setDescription(
                setUp.length || possible.length
                    ? l(
                          "Run /gameserver in a game's text channel to set up, update or remove its server."
                      )
                    : l(
                          "No game channel has a game server yet, and none of the active ones is for a game I know how to check. Run /gameserver in a game's text channel to set up its server anyway."
                      )
            );
        if (setUp.length) {
            embed.addFields({ name: l("Servers set up"), value: this.fieldText(setUp) });
        }
        if (possible.length) {
            embed.addFields({ name: l("Games I can check"), value: this.fieldText(possible) });
        }
        return { embeds: [embed], components: [] };
    },

    // As many `lines` as fit into an embed field.
    fieldText: function (lines) {
        let text = "";
        for (let line of lines) {
            let next = text ? `${text}\n${line}` : line;
            if (next.length > FIELD_MAX_LENGTH) break;
            text = next;
        }
        return text;
    },

    // In a game text channel: its game server, with buttons to set it up,
    // update or remove it. `notice` ({ color, text }) goes on top, e.g. what
    // the last button did.
    renderView: async function (channel, game, locale, notice = null) {
        let l = (...args) => this.l(locale, ...args);
        let server = await this.client.db.GameServer.findOne({ where: { channel: channel.id } });
        let archived = this.isArchived(channel);
        let embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(l("Game server of #%s", channel.name));
        let buttons;

        if (server) {
            let status = archived
                ? l("Not checked while this channel is archived.")
                : statusLine(l, server);
            if (!archived && server.checkedAt) {
                status += ` (${time(server.checkedAt, TimestampStyles.RelativeTime)})`;
            }
            embed.addFields(
                { name: l("Game"), value: gameTypeLabel(server.type), inline: true },
                { name: l("Status"), value: status, inline: true },
                { name: l("Address Ronja checks"), value: `${server.host}:${server.port}` }
            );
            if (server.connectAddress) {
                embed.addFields({
                    name: l("Address members connect to"),
                    value: server.connectAddress,
                });
            }
            buttons = [
                this.client
                    .myButton("✏️")
                    .setCustomId(SETUP_ID)
                    .setLabel(l("Update"))
                    .setStyle(ButtonStyle.Primary),
                this.client
                    .myButton("🗑️")
                    .setCustomId(REMOVE_ID)
                    .setLabel(l("Remove"))
                    .setStyle(ButtonStyle.Danger),
            ];
        } else {
            let types = gameTypesFor(game.name);
            let lines = [l("This channel has no game server set up yet.")];
            lines.push(
                types.length
                    ? l("I can check servers of %s.", types.map(gameTypeLabel).join(", "))
                    : l(
                          "I don't know which game to check for %s by its name, so please enter it when setting it up. [Here are the games I can check.](%s)",
                          game.name,
                          GAMES_LIST_URL
                      )
            );
            if (archived) {
                lines.push(
                    l(
                        "This channel is archived, so I'll only start checking once it's reactivated."
                    )
                );
            }
            embed.setDescription(lines.join("\n\n"));
            buttons = [
                this.client
                    .myButton("➕")
                    .setCustomId(SETUP_ID)
                    .setLabel(l("Set up"))
                    .setStyle(ButtonStyle.Primary),
            ];
        }

        let embeds = [embed];
        if (notice) {
            embeds.unshift(new EmbedBuilder().setColor(notice.color).setDescription(notice.text));
        }
        return { embeds, components: [new ActionRowBuilder().addComponents(buttons)] };
    },

    // The setup form, filled in with what was entered last (if it was
    // invalid), the current server, or the game the channel is for.
    setupModal: function (channel, game, server, input, locale) {
        let l = (...args) => this.l(locale, ...args);
        let ownType = gameTypesFor(game.name)[0];
        let values = input ?? {
            game: server ? gameType(server.type)?.name : ownType ? gameType(ownType).name : "",
            address: server?.host ?? "",
            port: server ? String(server.port) : "",
            connectAddress: server?.connectAddress ?? "",
        };
        let field = (id, label, placeholder, value, required) => {
            let input = new TextInputBuilder()
                .setCustomId(id)
                .setLabel(label.slice(0, 45))
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(placeholder.slice(0, 100))
                .setMaxLength(200)
                .setRequired(required);
            if (value) input.setValue(value);
            return new ActionRowBuilder().addComponents(input);
        };
        return new ModalBuilder()
            .setCustomId(MODAL_ID)
            .setTitle(l("Game server of #%s", channel.name).slice(0, 45))
            .addComponents(
                field("game", l("Game"), l("e.g. Valheim"), values.game, true),
                field(
                    "address",
                    l("Address Ronja checks"),
                    l("e.g. 192.168.1.20 or valheim.example.com"),
                    values.address,
                    true
                ),
                field("port", l("Port"), l("Empty: the game's usual port"), values.port, false),
                field(
                    "connectAddress",
                    l("Address members connect to"),
                    l("Empty: the address and port above"),
                    values.connectAddress,
                    false
                )
            );
    },

    // The Set up/Update button: shows the form, then saves what was entered
    // and checks the server right away, so the admin sees whether it works.
    handleSetup: async function (interaction, button, channel, game, state) {
        let locale = interaction.locale;
        let l = (...args) => this.l(locale, ...args);
        let server = await this.client.db.GameServer.findOne({ where: { channel: channel.id } });
        await button.showModal(this.setupModal(channel, game, server, state.input, locale));

        let submitted;
        try {
            submitted = await button.awaitModalSubmit({
                time: COLLECTOR_TIMEOUT_MS,
                filter: (m) => m.customId === MODAL_ID && m.user.id === interaction.user.id,
            });
        } catch {
            return; // Closed without submitting.
        }
        await submitted.deferUpdate();

        let input = {
            game: submitted.fields.getTextInputValue("game").trim(),
            address: submitted.fields.getTextInputValue("address").trim(),
            port: submitted.fields.getTextInputValue("port").trim(),
            connectAddress: submitted.fields.getTextInputValue("connectAddress").trim(),
        };
        let { values, error } = this.parseInput(input, l);
        if (error) {
            state.input = input;
            await interaction.editReply(
                await this.renderView(channel, game, locale, { color: Colors.Red, text: error })
            );
            return;
        }
        state.input = null;

        let archived = this.isArchived(channel);
        let status = archived ? null : await this.query(values);
        Object.assign(values, {
            online: status ? true : null,
            failures: status || archived ? 0 : 1,
            players: status?.players ?? null,
            maxPlayers: status?.maxPlayers ?? null,
            checkedAt: archived ? null : new Date(),
        });
        let [saved] = await this.client.myFindOrCreate(this.client.db.GameServer, {
            where: { channel: channel.id },
            defaults: values,
        });
        await saved.update(values);

        let result = archived
            ? l("This channel is archived, so I'll only start checking once it's reactivated.")
            : status
              ? l("The server answered: %s.", statusLine(l, saved))
              : l(
                    "The server didn't answer just now. If it doesn't answer the next check either, it's shown as offline."
                );
        let text = `${l("Saved. I'll check the server every 5 minutes and show its status in this channel's topic.")}\n\n${result}`;
        await interaction.editReply(
            await this.renderView(channel, game, locale, { color: Colors.Green, text })
        );

        console.log(
            `Set up the ${saved.type} server ${saved.host}:${saved.port} in #${channel.name}.`
        );
        await this.updateTopic(channel, saved, true);
    },

    // The form's input as a GameServer row's values - or an error to show.
    parseInput: function (input, l) {
        let types = findGameTypes(input.game);
        if (!types.length) {
            return {
                error: l(
                    "I don't know a game called %s whose server I can check. [Here are the games I can check.](%s)",
                    input.game,
                    GAMES_LIST_URL
                ),
            };
        }
        if (types.length > 1 && !gameTypesFor(input.game).length) {
            let shown = types.slice(0, AMBIGUOUS_SHOWN).map((id) => gameType(id).name);
            if (types.length > AMBIGUOUS_SHOWN) shown.push("...");
            return {
                error: l(
                    "%s fits several games: %s. Please enter one of them exactly.",
                    input.game,
                    shown.join(", ")
                ),
            };
        }
        let type = types[0];

        let port = gameType(type).options?.port;
        if (input.port) {
            port = /^\d+$/.test(input.port) ? Number(input.port) : 0;
            if (port < 1 || port > 65535) {
                return {
                    error: l("%s isn't a port. Please enter a number from 1 to 65535.", input.port),
                };
            }
        }
        if (!port) {
            return {
                error: l(
                    "%s has no usual port, please enter the server's port.",
                    gameTypeLabel(type)
                ),
            };
        }

        return {
            values: {
                type,
                host: input.address,
                port,
                connectAddress: input.connectAddress || null,
            },
        };
    },

    handleRemove: async function (interaction, button, channel, game) {
        let locale = interaction.locale;
        await button.deferUpdate();
        let server = await this.client.db.GameServer.findOne({ where: { channel: channel.id } });
        if (!server) {
            await interaction.editReply(await this.renderView(channel, game, locale));
            return;
        }

        await server.destroy();
        await interaction.editReply(
            await this.renderView(channel, game, locale, {
                color: Colors.Green,
                text: this.l(
                    locale,
                    "Removed the game server. I won't check it anymore and I'm clearing this channel's topic."
                ),
            })
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
