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
    time,
} = require("discord.js");
const { setTimeout: sleep } = require("node:timers/promises");
const { Op, fn, col } = require("sequelize");

const TOPIC_MAX_LENGTH = 1024; // Discord's limit for a channel topic.
const SEPARATOR = " | ";
// Playing a game only updates its channel's topic if it wasn't updated
// within this time - members start playing often, the minutes don't matter.
const PLAYED_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
// Between channels when going through all of them, so neither Discord nor
// the modules' sources (e.g. Steam) see a burst.
const CHANNEL_PAUSE_MS = 2000;
// The buttons work until shortly before the reply's interaction token expires.
const COLLECTOR_TIMEOUT_MS = 14 * 60 * 1000;
const PERMISSION_ERRORS = [RESTJSONErrorCodes.MissingPermissions, RESTJSONErrorCodes.MissingAccess];

// Where the parts go: lower comes first, and is dropped last when the topic
// gets too long. Other modules' parts use their own orders in between, see
// hookForChannelTopic in GameServer.js, Zocken.js and SteamNews.js.
const ORDER_CUSTOM_MESSAGE = 0;
const ORDER_LAST_PLAYED = 30;

const TOGGLE_ID = "channelTopicToggle";
const MESSAGE_ID = "channelTopicMessage";
const CLEAR_ID = "channelTopicClear";
const MODAL_ID = "channelTopicModal";

// The topic of game text channels: built from the parts every module returns
// from hookForChannelTopic (game server status, next /lfg session, latest
// Steam news, ...), plus when the game was last played and the admins' own
// message. Archived channels only get the last two. Rebuilt on startup and
// once a day (active channels only), when the game is played (at most once
// an hour), and when a module
// asks for it (client.myUpdateChannelTopic, e.g. on every game server check,
// when a /lfg session changes or a channel is created, archived or
// reactivated). /topic lets admins turn it off for a channel, or set their
// own message - the first time Ronja takes over a channel, its topic becomes
// that message, unless it's a game server's status Ronja put there before.
const myChannelTopic = {
    // channel id -> when Ronja last edited its topic
    lastEdits: new Map(),
    // channel ids whose owner was told about a missing permission already,
    // until it works again
    ownerNotified: new Set(),
    // channel id -> the channel's update in progress, and whether another one
    // is waiting for it (see updateTopic)
    updates: new Map(),
    refreshing: false,

    commands: [
        new SlashCommandBuilder()
            .setName("topic")
            .setNameLocalizations({ de: "kanalthema" })
            .setDescription("Turn this game channel's topic off or on, or add your own message.")
            .setDescriptionLocalizations({
                de: "Schalte das Thema dieses Spielkanals aus oder an, oder füge eine eigene Nachricht hinzu.",
            })
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false),
    ],

    isArchived: function (channel) {
        let archive = this.cfg("dtcArchivedGamesCategory");
        return Boolean(archive) && channel.parentId === archive;
    },

    settingsOf: async function (channel) {
        return await this.client.db.ChannelTopic.findOne({ where: { channel: channel.id } });
    },

    // Rebuilds a channel's topic, see client.myUpdateChannelTopic.
    hookForUpdateChannelTopic: async function (channel) {
        if (typeof channel === "string") {
            channel = await this.client.channels.fetch(channel).catch(() => null);
        }
        if (channel) await this.updateTopic(channel);
    },

    // One update per channel at a time, so two of them can't both see the old
    // topic and edit it twice. When Discord's limit for topic edits (2 per
    // channel every 10 minutes) is used up, discord.js waits until it allows
    // the edit - meanwhile, all further updates of the channel become one,
    // which then builds the newest topic.
    updateTopic: function (channel) {
        let current = this.updates.get(channel.id);
        if (current?.waiting) return current.promise;

        let entry = { waiting: Boolean(current) };
        entry.promise = (current?.promise ?? Promise.resolve())
            .then(() => {
                entry.waiting = false;
                return this.applyTopic(channel);
            })
            .catch((err) => console.error(`Could not update the topic of #${channel.name}:`, err))
            .finally(() => {
                if (this.updates.get(channel.id) === entry) this.updates.delete(channel.id);
            });
        this.updates.set(channel.id, entry);
        return entry.promise;
    },

    applyTopic: async function (channel) {
        // A channel can be shared by several games.
        let games = await this.client.db.Game.findAll({ where: { channel: channel.id } });
        if (!games.length) return;
        let settings = (await this.settingsOf(channel)) ?? (await this.takeOver(channel));
        if (!settings.enabled) return;

        let topic = await this.buildTopic(channel, games, settings);
        if ((channel.topic ?? "") === topic) return;

        this.lastEdits.set(channel.id, Date.now());
        try {
            await channel.setTopic(topic);
            this.ownerNotified.delete(channel.id);
        } catch (err) {
            if (!this.notifyOwnerOnce(channel, err)) {
                console.error(`Could not update the topic of #${channel.name}:`, err);
            }
        }
    },

    // The first update of a channel: keeps the topic it has as its custom
    // message - unless it has a game server, whose status (or, while archived,
    // address) is what Ronja put there before.
    takeOver: async function (channel) {
        let server = await this.client.db.GameServer.count({ where: { channel: channel.id } });
        let customMessage = (!server && channel.topic?.trim()) || null;
        let [settings] = await this.client.myFindOrCreate(this.client.db.ChannelTopic, {
            where: { channel: channel.id },
            defaults: { customMessage },
        });
        if (customMessage) console.log(`Kept the topic of #${channel.name} as its message.`);
        return settings;
    },

    // The topic `channel` should have, from all parts that fit.
    buildTopic: async function (channel, games, settings) {
        let locale = channel.guild.preferredLocale;
        let parts = [];
        if (settings?.customMessage) {
            parts.push({ order: ORDER_CUSTOM_MESSAGE, text: settings.customMessage });
        }
        let lastPlayed = await this.lastPlayedPart(channel, locale);
        if (lastPlayed) parts.push(lastPlayed);

        if (!this.isArchived(channel)) {
            let answers = await Promise.all(
                this.client.myModules
                    .filter((m) => m.hookForChannelTopic)
                    .map(async (m) => {
                        try {
                            return await m.hookForChannelTopic(channel, games, locale);
                        } catch (err) {
                            console.error(`Could not get a topic part for #${channel.name}:`, err);
                            return null;
                        }
                    })
            );
            parts.push(...answers.flat().filter((p) => p?.text));
        }

        parts.sort((a, b) => a.order - b.order);
        let topic = parts.map((p) => p.text).join(SEPARATOR);
        while (topic.length > TOPIC_MAX_LENGTH && parts.length > 1) {
            parts.pop();
            topic = parts.map((p) => p.text).join(SEPARATOR);
        }
        return topic.slice(0, TOPIC_MAX_LENGTH);
    },

    // When anyone last started playing any of the channel's games (a channel
    // can be shared by several), as a timestamp Discord shows relative to now
    // ("3 hours ago") - it stays right without edits.
    lastPlayedPart: async function (channel, locale) {
        let latest = await this.client.db.GameStatus.findOne({
            attributes: ["lastplayed"],
            include: [
                {
                    model: this.client.db.Game,
                    attributes: [],
                    where: { channel: channel.id },
                    required: true,
                },
            ],
            order: [["lastplayed", "DESC"]],
        });
        let lastPlayed = latest?.lastplayed;
        if (!lastPlayed) return null;
        return {
            order: ORDER_LAST_PLAYED,
            text: `🕹️ ${this.l(locale, "Last played %s", time(new Date(lastPlayed), TimestampStyles.RelativeTime))}`,
        };
    },

    // Like client.myNotifyOwnerOnPermissionError, but only once per channel
    // until it works again - game server channels are updated every 5 minutes.
    notifyOwnerOnce: function (channel, err) {
        if (this.ownerNotified.has(channel.id)) return PERMISSION_ERRORS.includes(err?.code);
        let message = this.l(
            channel.guild.preferredLocale,
            "Could not update the topic of #%s: I need the Manage Channels permission there.",
            channel.name
        );
        if (!this.client.myNotifyOwnerOnPermissionError(channel.guild, err, message)) return false;
        this.ownerNotified.add(channel.id);
        return true;
    },

    // Every active game text channel, one after another with a pause in
    // between: on startup and once a day, e.g. for new Steam news. Archived
    // channels' topics only change when the game is played, /topic changes
    // them or the channel is archived - each of those updates it right away.
    refreshAll: async function () {
        if (this.refreshing) return;
        this.refreshing = true;
        try {
            // Once per channel, also when several games share it.
            let channels = await this.client.db.Game.findAll({
                attributes: [[fn("DISTINCT", col("channel")), "channel"]],
                where: { channel: { [Op.ne]: null } },
                raw: true,
            });
            for (let { channel: id } of channels) {
                let channel = await this.client.channels.fetch(id).catch(() => null);
                if (!channel || this.isArchived(channel)) continue;
                // Not awaited: one channel waiting for Discord's limit
                // mustn't hold up the others.
                this.updateTopic(channel);
                await sleep(CHANNEL_PAUSE_MS);
            }
        } finally {
            this.refreshing = false;
        }
    },

    // Only if the topic wasn't updated within the last hour. A channel that's
    // only being created or reactivated right now is updated by
    // DynamicTextChannels once it's done.
    hookForStartedPlaying: async function (oldPresence, newPresence, newActivity, game) {
        if (!game.channel) return;
        let lastEdit = this.lastEdits.get(game.channel) ?? 0;
        if (Date.now() - lastEdit < PLAYED_UPDATE_INTERVAL_MS) return;
        await this.hookForUpdateChannelTopic(game.channel);
    },

    hookForReady: async function () {
        await this.refreshAll();
    },

    hookForChannelDelete: async function (channel) {
        await this.client.db.ChannelTopic.destroy({ where: { channel: channel.id } });
        this.lastEdits.delete(channel.id);
        this.ownerNotified.delete(channel.id);
    },

    hookForCron: function () {
        return [
            {
                schedule: "0 6 * * *", // https://crontab.guru/
                action: async () => await this.refreshAll(),
            },
        ];
    },

    // /topic

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "topic") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let locale = interaction.locale;
        let channelId = interaction.channel?.isThread()
            ? interaction.channel.parentId
            : interaction.channelId;
        let game = await this.client.db.Game.findOne({ where: { channel: channelId } });
        if (!game) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(locale, "/topic only works in a game's text channel.")
                        ),
                ],
            });
            return;
        }

        let channel = await this.client.channels.fetch(channelId);
        let message = await interaction.editReply(await this.renderView(channel, locale));
        let view = { interaction, channel };
        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: COLLECTOR_TIMEOUT_MS,
        });
        collector.on("collect", async (i) => {
            try {
                if (i.customId === TOGGLE_ID) await this.handleToggle(view, i);
                if (i.customId === MESSAGE_ID) await this.handleMessage(view, i);
                if (i.customId === CLEAR_ID) await this.handleClear(view, i);
            } catch (err) {
                console.error("Error handling a /topic button:", err);
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

    // The channel's topic settings with buttons to change them. `notice`
    // ({ color, text }) goes on top, e.g. what the last button did.
    renderView: async function (channel, locale, notice = null) {
        let l = (...args) => this.l(locale, ...args);
        let settings = await this.settingsOf(channel);
        let enabled = settings?.enabled ?? true;
        let customMessage = settings?.customMessage;

        let embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(l("Topic of #%s", channel.name))
            .setDescription(
                enabled
                    ? l(
                          "I keep this channel's topic up to date: when the game was last played, its game server, the next /lfg session and its latest Steam news - and your message, if you add one."
                      )
                    : l(
                          "I don't change this channel's topic, so you can set your own. Its game server status isn't shown there either."
                      )
            )
            .addFields(
                {
                    name: l("Automatic topic"),
                    value: enabled ? l("On") : l("Off"),
                    inline: true,
                },
                {
                    name: l("Your message"),
                    value: customMessage || l("None"),
                    inline: true,
                }
            );

        let buttons = [
            enabled
                ? this.client
                      .myButton("🚫")
                      .setCustomId(TOGGLE_ID)
                      .setLabel(l("Turn off"))
                      .setStyle(ButtonStyle.Secondary)
                : this.client
                      .myButton("✅")
                      .setCustomId(TOGGLE_ID)
                      .setLabel(l("Turn on"))
                      .setStyle(ButtonStyle.Primary),
            this.client
                .myButton("✏️")
                .setCustomId(MESSAGE_ID)
                .setLabel(customMessage ? l("Change message") : l("Add message"))
                .setStyle(ButtonStyle.Primary),
        ];
        if (customMessage) {
            buttons.push(
                this.client
                    .myButton("🗑️")
                    .setCustomId(CLEAR_ID)
                    .setLabel(l("Remove message"))
                    .setStyle(ButtonStyle.Danger)
            );
        }

        let embeds = [embed];
        if (notice) {
            embeds.unshift(new EmbedBuilder().setColor(notice.color).setDescription(notice.text));
        }
        return { embeds, components: [new ActionRowBuilder().addComponents(buttons)] };
    },

    saveSettings: async function (channel, values) {
        let [settings] = await this.client.myFindOrCreate(this.client.db.ChannelTopic, {
            where: { channel: channel.id },
            defaults: values,
        });
        await settings.update(values);
        return settings;
    },

    // Shows the saved change (`notice` on top of the view) and, if `updateTopic`,
    // updates the topic in the background - Discord may hold the edit back for
    // a few minutes (see updateTopic), and the admin sees the topic in the
    // channel anyway.
    showChange: async function (view, notice, updateTopic) {
        let { interaction, channel } = view;
        if (updateTopic) this.updateTopic(channel);
        await interaction.editReply(await this.renderView(channel, interaction.locale, notice));
    },

    handleToggle: async function (view, button) {
        let { interaction, channel } = view;
        let locale = interaction.locale;
        await button.deferUpdate();
        let enabled = !((await this.settingsOf(channel))?.enabled ?? true);
        await this.saveSettings(channel, { enabled });
        console.log(`Turned Ronja's topic of #${channel.name} ${enabled ? "on" : "off"}.`);

        let text = enabled
            ? this.l(locale, "Turned on. I'm keeping this channel's topic up to date again.")
            : this.l(
                  locale,
                  "Turned off. I won't change this channel's topic anymore, so you can set your own."
              );
        await this.showChange(view, { color: Colors.Green, text }, enabled);
    },

    handleMessage: async function (view, button) {
        let { interaction, channel } = view;
        let locale = interaction.locale;
        let settings = await this.settingsOf(channel);
        let input = new TextInputBuilder()
            .setCustomId("message")
            .setLabel(this.l(locale, "Your message").slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(TOPIC_MAX_LENGTH)
            .setRequired(true);
        if (settings?.customMessage) input.setValue(settings.customMessage);
        await button.showModal(
            new ModalBuilder()
                .setCustomId(MODAL_ID)
                .setTitle(this.l(locale, "Topic of #%s", channel.name).slice(0, 45))
                .addComponents(new ActionRowBuilder().addComponents(input))
        );

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

        let customMessage = submitted.fields.getTextInputValue("message").trim();
        settings = await this.saveSettings(channel, { customMessage: customMessage || null });
        console.log(`Set the topic message of #${channel.name}.`);
        await this.afterMessageChange(view, settings);
    },

    handleClear: async function (view, button) {
        await button.deferUpdate();
        let settings = await this.saveSettings(view.channel, { customMessage: null });
        console.log(`Removed the topic message of #${view.channel.name}.`);
        await this.afterMessageChange(view, settings);
    },

    afterMessageChange: async function (view, settings) {
        let locale = view.interaction.locale;
        let text = settings.customMessage
            ? this.l(locale, "Saved your message.")
            : this.l(locale, "Removed your message.");
        if (!settings.enabled) {
            text += ` ${this.l(locale, "It's only shown once you turn the automatic topic on.")}`;
        }
        await this.showChange(view, { color: Colors.Green, text }, settings.enabled);
    },
};

module.exports = myChannelTopic;
