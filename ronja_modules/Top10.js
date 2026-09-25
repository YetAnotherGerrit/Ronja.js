const { EmbedBuilder, Colors, SlashCommandBuilder, MessageFlags } = require("discord.js");
const { DateTime } = require("luxon");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const { duration, isMember, truncate } = require("../core/gameCard.js");

const TOP = 10;
// The columns are narrow - longer names would wrap over several lines.
const NAME_LENGTH = 32;

const myTop10 = {
    commands: [
        new SlashCommandBuilder()
            .setName("top10")
            .setDescription("List the top 10 games, members in voice channels and game channels.")
            .setDescriptionLocalizations({
                de: "Zeigt die Top 10 der Spiele, der Mitglieder in Sprachkanälen und der Spielekanäle.",
            })
            .addIntegerOption((option) =>
                option
                    .setName("days")
                    .setNameLocalizations({ de: "tage" })
                    .setDescription("Top 10 for what period?")
                    .setDescriptionLocalizations({
                        de: "Top 10 für welchen Zeitraum?",
                    })
                    .setRequired(false)
            )
            .setDMPermission(false),
    ],

    // Members in a voice channel, by id: since when their time there hasn't
    // been stored yet. Members who were already in voice when Ronja got ready
    // are missing and count from then on (see voiceSinceFor).
    voiceSince: new Map(),

    // Time in the guild's AFK channel doesn't count, neither does any bot's.
    inCountedVoice: function (state) {
        return Boolean(
            state.channelId &&
            state.channelId !== state.guild.afkChannelId &&
            !state.member?.user.bot
        );
    },

    voiceSinceFor: function (member) {
        return this.voiceSince.get(member) ?? this.client.readyAt;
    },

    today: function (date = new Date()) {
        return DateTime.fromJSDate(date).setZone(this.cfg("timezone"));
    },

    // Adds `amount` to the `counterColumn` of the row for `key` (in
    // `keyColumn`) and `day` in `table`, creating the row if needed.
    addToDay: async function (table, keyColumn, key, day, counterColumn, amount) {
        // A raw upsert, so concurrent additions can't overwrite each other. The
        // Date is passed as a replacement: bulkUpdate etc. would store it as an
        // epoch number on SQLite, which Sequelize then can't read back.
        await this.client.db.sequelize.query(
            `INSERT INTO "${table}" ("${keyColumn}", "day", "${counterColumn}", "createdAt", "updatedAt")
            VALUES (:key, :day, :amount, :now, :now)
            ON CONFLICT ("${keyColumn}", "day") DO UPDATE SET
                "${counterColumn}" = "${counterColumn}" + excluded."${counterColumn}",
                "updatedAt" = excluded."updatedAt"`,
            { replacements: { key, day, amount, now: new Date() } }
        );
    },

    // Stores the time `member` spent in voice from `from` to `to`, split into
    // the days (in the configured timezone) it falls on.
    addVoiceTime: async function (member, from, to) {
        let start = this.today(from);
        let end = this.today(to);
        while (start < end) {
            let nextDay = start.startOf("day").plus({ days: 1 });
            let until = nextDay < end ? nextDay : end;
            let seconds = Math.round(until.diff(start).as("seconds"));
            if (seconds > 0)
                await this.addToDay(
                    "VoiceTimes",
                    "member",
                    member,
                    start.toISODate(),
                    "seconds",
                    seconds
                );
            start = until;
        }
    },

    // Stores the voice time of everyone still in voice up to now, so /top10
    // includes it and a restart loses at most the time since the last flush.
    flushVoiceTime: async function () {
        let now = new Date();
        let inVoice = [];
        this.client.guilds.cache.forEach((guild) =>
            guild.voiceStates.cache.forEach((state) => {
                if (this.inCountedVoice(state)) inVoice.push(state.id);
            })
        );

        let flushed = inVoice.map((member) => [member, this.voiceSinceFor(member)]);
        // Anyone else left without Ronja noticing (e.g. while reconnecting to
        // Discord) - when is unknown, so their time since the last flush is lost.
        this.voiceSince.clear();
        flushed.forEach(([member]) => this.voiceSince.set(member, now));

        for (let [member, since] of flushed) await this.addVoiceTime(member, since, now);
    },

    hookForVoiceUpdate: async function (oldState, newState) {
        let was = this.inCountedVoice(oldState);
        let is = this.inCountedVoice(newState);
        if (was === is) return;

        let member = newState.id;
        if (is) {
            this.voiceSince.set(member, new Date());
            return;
        }
        let since = this.voiceSinceFor(member);
        this.voiceSince.delete(member);
        await this.addVoiceTime(member, since, new Date());
    },

    // Counts members' messages in game text channels (and their threads).
    hookForMessageCreate: async function (message) {
        if (!message.inGuild() || message.author.bot || message.system) return;

        let channel = message.channel.isThread() ? message.channel.parentId : message.channelId;
        let game = await this.client.db.Game.findOne({ where: { channel }, attributes: ["id"] });
        if (!game) return;

        await this.addToDay(
            "ChannelMessages",
            "channel",
            channel,
            this.today(message.createdAt).toISODate(),
            "messages",
            1
        );
    },

    topGames: async function (since) {
        let g = await this.client.db.Game.findAll({
            raw: true,
            attributes: ["name", "igdbId", [Sequelize.fn("COUNT", "*"), "cName"]],
            include: [
                {
                    model: this.client.db.GameStatus,
                    where: { lastplayed: { [Op.gte]: since.toJSDate() } },
                },
            ],
            order: [
                [Sequelize.fn("count", Sequelize.col("*")), "DESC"],
                [this.client.db.GameStatus, "lastplayed", "DESC"],
            ],
            group: "Game.name",
        });

        return {
            first: g[0],
            lines: g
                .slice(0, TOP)
                .map(
                    (gg) =>
                        `**${gg.cName}**  :busts_in_silhouette:  ${truncate(gg.name, NAME_LENGTH)}`
                ),
        };
    },

    // Sums a daily counter per key since the day `since` falls on, ranked. All
    // keys, so callers can skip some (e.g. members who left) before the top 10.
    sumPerKey: async function (model, key, counter, since) {
        return model.findAll({
            raw: true,
            attributes: [key, [Sequelize.fn("SUM", Sequelize.col(counter)), "total"]],
            where: { day: { [Op.gte]: since.toISODate() } },
            group: [key],
            order: [[Sequelize.fn("SUM", Sequelize.col(counter)), "DESC"]],
        });
    },

    topVoiceMembers: async function (guild, lng, since) {
        await this.flushVoiceTime();
        let rows = await this.sumPerKey(this.client.db.VoiceTime, "member", "seconds", since);

        let lines = [];
        for (let row of rows) {
            if (lines.length >= TOP) break;
            // Members who left the guild are skipped.
            if (!(await isMember(guild, row.member))) continue;
            let name = guild.members.cache.get(row.member).displayName;
            lines.push(
                `**${duration((...a) => this.l(lng, ...a), row.total)}**  :loud_sound:  ${truncate(name, NAME_LENGTH)}`
            );
        }
        return lines;
    },

    topGameChannels: async function (guild, lng, since) {
        let rows = await this.sumPerKey(
            this.client.db.ChannelMessages,
            "channel",
            "messages",
            since
        );

        // Plain names, no channel mentions: game channels are only visible to
        // their players, others would just see "No Access".
        return rows
            .map((row) => [row, guild.channels.cache.get(row.channel)])
            .filter(([, channel]) => channel) // deleted channels are skipped
            .slice(0, TOP)
            .map(
                ([row, channel]) =>
                    `**${row.total}**  :speech_balloon:  #${truncate(channel.name, NAME_LENGTH)}`
            );
    },

    createTop10Embed: async function (guild, lng, pDays = 14) {
        let since = DateTime.now().setZone(this.cfg("timezone")).minus({ days: pDays });

        let e = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(this.l(lng, "The server's top 10!"))
            .setDescription(this.l(lng, "The last %d days at a glance:", pDays));

        let [games, voice, channels] = await Promise.all([
            this.topGames(since),
            this.topVoiceMembers(guild, lng, since),
            this.topGameChannels(guild, lng, since),
        ]);

        // As the embed's image, not its thumbnail: next to a thumbnail, Discord
        // puts only two inline fields in a row.
        if (games.first) {
            let details = await this.client.myGameDetails(games.first);
            if (details?.coverUrl) e.setImage(details.coverUrl);
        }

        e.addFields([
            {
                name: this.l(lng, "Top 10 by player count:"),
                value: games.lines.join("\n") || this.l(lng, "No games have been played."),
                inline: true,
            },
            {
                name: this.l(lng, "Top 10 by time in voice channels:"),
                value: voice.join("\n") || this.l(lng, "Nobody has been in a voice channel."),
                inline: true,
            },
            {
                name: this.l(lng, "Top 10 game channels by messages:"),
                value:
                    channels.join("\n") ||
                    this.l(lng, "Nothing has been posted in the game channels."),
                inline: true,
            },
        ]);

        return e;
    },

    postTop10ToChannel: async function (pDays, pDescription) {
        this.client.channels
            .fetch(this.cfg("top10CronChannel"))
            .then((c) => {
                this.createTop10Embed(c.guild, c.guild.preferredLocale, pDays)
                    .then((e) => {
                        e.setDescription(this.l(c.guild.preferredLocale, pDescription));
                        c.send({ embeds: [e] });
                    })
                    .catch(console.error);
            })
            .catch(console.error);
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName == "top10") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            let e = await this.createTop10Embed(
                interaction.guild,
                interaction.locale,
                interaction.options.getInteger("days") || 14
            );

            interaction.editReply({ embeds: [e] });
        }
    },

    hookForCron: function () {
        let schedules = [
            {
                schedule: "0 * * * *",
                action: () => this.flushVoiceTime(),
            },
        ];

        if (!this.cfg("top10CronChannel")) {
            console.info("INFO: no top10CronChannel set, disabling Top10-postings!");
            return schedules;
        }

        return [
            ...schedules,
            {
                schedule: "0 8 * * 1",
                action: () => {
                    if (this.cfg("top10Weekly") === "true")
                        this.postTop10ToChannel(7, "Last week at a glance:");
                },
            },
            {
                schedule: "0 7 1 * *",
                action: () => {
                    if (this.cfg("top10Monthly") === "true")
                        this.postTop10ToChannel(30, "Last month at a glance:");
                },
            },
            {
                schedule: "0 0 1 1 *",
                action: () => {
                    if (this.cfg("top10Yearly") === "true")
                        this.postTop10ToChannel(
                            365,
                            "Happy new year! These have been the highlights of last year:"
                        );
                },
            },
        ];
    },
};

module.exports = myTop10;
