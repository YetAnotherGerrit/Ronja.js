const {
    EmbedBuilder,
    Colors,
    SlashCommandBuilder,
    MessageFlags,
    ButtonStyle,
} = require("discord.js");
const { DateTime } = require("luxon");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const { duration, isMember, truncate } = require("../core/gameCard.js");
const { countDistinctPlayers } = require("../core/gameList.js");
const { withShareButton } = require("../core/share.js");

const TOP = 10;
// The columns are narrow - longer names would wrap over several lines.
const NAME_LENGTH = 32;

// The automatic postings, each turned on by its `setting`. The members in a
// posting's voice column get the top10Role until that period's next posting.
const PERIODS = {
    weekly: {
        schedule: "0 8 * * 1",
        setting: "top10Weekly",
        days: 7,
        description: "Last week at a glance:",
    },
    monthly: {
        schedule: "0 7 1 * *",
        setting: "top10Monthly",
        days: 30,
        description: "Last month at a glance:",
    },
    yearly: {
        schedule: "0 0 1 1 *",
        setting: "top10Yearly",
        days: 365,
        description: "Happy new year! These have been the highlights of last year:",
    },
};

// One ranking line: `number` in bold, unless the column's top10Hide* setting
// hides it (the order stays the same).
function rankLine(hideNumbers, number, emoji, name) {
    let line = `${emoji}  ${truncate(name, NAME_LENGTH)}`;
    return hideNumbers ? line : `**${number}**  ${line}`;
}

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

    // Members in voice with others, by id: since when their time there hasn't
    // been stored yet (see isCounting).
    voiceSince: new Map(),

    // Only time with at least one other member counts: not alone, not with
    // just bots, not in the guild's AFK channel - and no bot's time at all.
    isCounting: function (state) {
        if (!state?.channel || state.channelId === state.guild.afkChannelId) return false;
        if (state.member?.user.bot) return false;
        return state.channel.members.filter((m) => !m.user.bot).size >= 2;
    },

    // Starts or stores `member`'s voice time, as `counting` now says.
    setCounting: async function (member, counting, now) {
        let since = this.voiceSince.get(member);
        if (counting) {
            if (!since) this.voiceSince.set(member, now);
            return;
        }
        if (!since) return;
        this.voiceSince.delete(member);
        await this.addVoiceTime(member, since, now);
    },

    countedVoiceStates: function () {
        let states = [];
        this.client.guilds.cache.forEach((guild) =>
            guild.voiceStates.cache.forEach((state) => {
                if (this.isCounting(state)) states.push(state);
            })
        );
        return states;
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

    // Stores the voice time of everyone still in voice with others up to now,
    // so /top10 includes it and a restart loses at most the time since then.
    flushVoiceTime: async function () {
        let now = new Date();
        let counting = this.countedVoiceStates().map((state) => state.id);

        let flushed = counting.map((member) => [member, this.voiceSince.get(member)]);
        // Anyone else stopped counting without Ronja noticing (e.g. while
        // reconnecting to Discord) - when is unknown, so their time since the
        // last flush is lost. Likewise, anyone who started unnoticed counts from now.
        this.voiceSince.clear();
        counting.forEach((member) => this.voiceSince.set(member, now));

        for (let [member, since] of flushed) if (since) await this.addVoiceTime(member, since, now);
    },

    // A join, leave or move can start or end the counted time of everyone in
    // the channels involved, e.g. the one left behind alone.
    hookForVoiceUpdate: async function (oldState, newState) {
        let now = new Date();
        let states = new Map([[newState.id, newState]]);
        [oldState.channel, newState.channel].forEach((channel) =>
            channel?.members.forEach((m) => states.set(m.id, m.voice))
        );

        for (let [member, state] of states)
            await this.setCounting(member, this.isCounting(state), now);
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

    topGames: async function (since, hideNumbers) {
        let gamesPlayed = await this.client.db.Game.findAll({
            raw: true,
            attributes: ["name", [countDistinctPlayers, "playerCount"]],
            include: [
                {
                    model: this.client.db.GameStatus,
                    where: { lastplayed: { [Op.gte]: since.toJSDate() } },
                },
            ],
            order: [
                [countDistinctPlayers, "DESC"],
                [this.client.db.GameStatus, "lastplayed", "DESC"],
            ],
            group: "Game.name",
        });

        return gamesPlayed
            .slice(0, TOP)
            .map((gamePlayed) =>
                rankLine(
                    hideNumbers,
                    gamePlayed.playerCount,
                    ":busts_in_silhouette:",
                    gamePlayed.name
                )
            );
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

    // The top members by time in voice: [{ member, seconds }].
    topVoiceMembers: async function (guild, since) {
        await this.flushVoiceTime();
        let rows = await this.sumPerKey(this.client.db.VoiceTime, "member", "seconds", since);

        let top = [];
        for (let row of rows) {
            if (top.length >= TOP) break;
            // Members who left the guild are skipped.
            if (!(await isMember(guild, row.member))) continue;
            top.push({ member: guild.members.cache.get(row.member), seconds: row.total });
        }
        return top;
    },

    topGameChannels: async function (guild, lng, since, hideNumbers) {
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
            .map(([row, channel]) =>
                rankLine(hideNumbers, row.total, ":speech_balloon:", `#${channel.name}`)
            );
    },

    // The top 10 embed, and the members in its voice column.
    createTop10Embed: async function (guild, lng, pDays = 14) {
        let since = DateTime.now().setZone(this.cfg("timezone")).minus({ days: pDays });

        let e = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(this.l(lng, "The server's top 10!"))
            .setDescription(this.l(lng, "The last %d days at a glance:", pDays));

        let hide = (setting) => this.cfg(setting) === "true";
        let [games, voiceMembers, channels] = await Promise.all([
            this.topGames(since, hide("top10HideGamePlayers")),
            this.topVoiceMembers(guild, since),
            this.topGameChannels(guild, lng, since, hide("top10HideChannelMessages")),
        ]);
        let hideVoiceTime = hide("top10HideVoiceTime");
        let voice = voiceMembers.map(({ member, seconds }) => {
            let time = hideVoiceTime ? null : duration((...a) => this.l(lng, ...a), seconds);
            return rankLine(hideVoiceTime, time, ":loud_sound:", member.displayName);
        });

        e.addFields([
            {
                name: this.l(lng, "Games by player count"),
                value: games.join("\n") || this.l(lng, "No games have been played."),
                inline: true,
            },
            {
                name: this.l(lng, "Members by time in voice"),
                value: voice.join("\n") || this.l(lng, "Nobody has been in a voice channel."),
                inline: true,
            },
            {
                name: this.l(lng, "Game channels by messages"),
                value:
                    channels.join("\n") ||
                    this.l(lng, "Nothing has been posted in the game channels."),
                inline: true,
            },
        ]);

        return { embed: e, voiceMembers: voiceMembers.map(({ member }) => member) };
    },

    // The automatic posting of `period`, if it's turned on. Either way, its
    // voice column (none if it's off) gets the top10Role from now on.
    postTop10ToChannel: async function (period) {
        let { setting, days, description } = PERIODS[period];
        let c = await this.client.channels.fetch(this.cfg("top10CronChannel"));
        let lng = c.guild.preferredLocale;

        let voiceMembers = [];
        if (this.cfg(setting) === "true") {
            let top10 = await this.createTop10Embed(c.guild, lng, days);
            top10.embed.setDescription(this.l(lng, description));
            await c.send({ embeds: [top10.embed] });
            voiceMembers = top10.voiceMembers;
        }

        await this.updateTopRole(c.guild, period, voiceMembers);
    },

    // The role with `id` in `guild`, or null if there's none.
    fetchRole: async function (guild, id) {
        if (!id) return null;
        return await guild.roles.fetch(id).catch(() => null);
    },

    // Lets the guild owner know if Ronja wasn't allowed to give or take the top10Role.
    notifyOnRoleError: function (guild, err) {
        return this.client.myNotifyOwnerOnPermissionError(
            guild,
            err,
            this.l(
                guild.preferredLocale,
                "I couldn't give or take the role for the top 10's members (top10Role). I need the Manage Roles permission, and my highest role must be above it."
            )
        );
    },

    // Gives the top10Role to `members`, the voice column of `period`'s new
    // posting, and takes it from the members of its last one who aren't in a
    // current posting of another period anymore. Ronja only ever takes it from
    // members she gave it to: whoever had it already is left alone.
    updateTopRole: async function (guild, period, members) {
        let id = this.cfg("top10Role");
        if (!id) return;
        let role = await this.fetchRole(guild, id);
        if (!role) {
            await this.client.myNotifyOwner(
                guild,
                this.l(
                    guild.preferredLocale,
                    "The role for the top 10's members (top10Role) doesn't exist anymore. Please choose another one in /settings."
                )
            );
            return;
        }

        let rows = await this.client.db.Top10RoleMember.findAll({ raw: true });
        let fromRonja = new Set(rows.map((row) => row.member));
        let elsewhere = new Set(rows.filter((r) => r.period !== period).map((r) => r.member));
        let earned = members.filter((m) => fromRonja.has(m.id) || !m.roles.cache.has(role.id));
        let stays = new Set([...elsewhere, ...earned.map((m) => m.id)]);
        let gone = rows
            .filter((r) => r.period === period && !stays.has(r.member))
            .map((r) => r.member);

        try {
            for (let member of earned) {
                if (!member.roles.cache.has(role.id)) await member.roles.add(role);
            }
            for (let member of gone) {
                if (await isMember(guild, member))
                    await guild.members.cache.get(member).roles.remove(role);
            }
        } catch (err) {
            if (this.notifyOnRoleError(guild, err)) return;
            throw err;
        }

        await this.client.db.Top10RoleMember.destroy({ where: { period } });
        await this.client.db.Top10RoleMember.bulkCreate(
            earned.map((member) => ({ period, member: member.id }))
        );
        console.log(
            `Top10: ${role.name} for the ${period} top 10 given to ${earned.length} members, taken from ${gone.length}.`
        );
    },

    // Before the top10Role changes or is cleared while members have the old
    // one from Ronja: should they lose it right away (and get the new one), or
    // keep it? See hookForSettingChange.
    hookForSettingQuestion: async function (name, oldValue, newValue, locale) {
        if (name !== "top10Role" || !oldValue) return;
        let count = await this.client.db.Top10RoleMember.count({ distinct: true, col: "member" });
        if (!count) return;

        let question = newValue
            ? "%d members have <@&%s> from the top 10 postings. Should I take it from them now and give them the new role instead, or let them keep it? Then the new role only goes to the members of the next postings."
            : "%d members have <@&%s> from the top 10 postings. Should I take it from them now, or let them keep it?";
        return {
            description: this.l(locale, question, count, oldValue),
            answers: [
                { id: "switch", emoji: "🔁", label: this.l(locale, "Switch now") },
                {
                    id: "keep",
                    emoji: "🎁",
                    label: this.l(locale, "Let them keep it"),
                    style: ButtonStyle.Secondary,
                },
            ],
        };
    },

    // A changed or cleared top10Role: on "switch", the members Ronja gave the
    // old one to get the new one instead. Otherwise they keep the old one as
    // if someone else gave it to them, and only the next postings give out
    // the new one.
    hookForSettingChange: async function (name, oldValue, newValue, answer) {
        if (name !== "top10Role" || !oldValue) return;
        let kept = answer === "switch" ? await this.switchTopRole(oldValue, newValue) : [];
        await this.client.db.Top10RoleMember.destroy({ where: { member: { [Op.notIn]: kept } } });
    },

    // Moves the members Ronja gave the role `oldId` to over to `newId` (or
    // none). Returns the ones Ronja gave the new role to.
    switchTopRole: async function (oldId, newId) {
        let guild = this.client.guilds.cache.first();
        let [oldRole, newRole] = await Promise.all([
            this.fetchRole(guild, oldId),
            this.fetchRole(guild, newId),
        ]);
        let rows = await this.client.db.Top10RoleMember.findAll({ raw: true });

        let kept = [];
        try {
            for (let id of new Set(rows.map((row) => row.member))) {
                if (!(await isMember(guild, id))) continue;
                let member = guild.members.cache.get(id);
                if (oldRole) await member.roles.remove(oldRole);
                // Whoever has the new role already got it from someone else.
                if (!newRole || member.roles.cache.has(newRole.id)) continue;
                await member.roles.add(newRole);
                kept.push(id);
            }
        } catch (err) {
            if (!this.notifyOnRoleError(guild, err)) throw err;
        }
        return kept;
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "top10") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let { embed } = await this.createTop10Embed(
            interaction.guild,
            interaction.locale,
            interaction.options.getInteger("days") || 14
        );

        interaction.editReply({
            embeds: [embed],
            components: withShareButton(this.client, interaction.locale),
        });
    },

    // Whoever is already in voice with others counts from now on.
    hookForReady: function () {
        let now = new Date();
        this.countedVoiceStates().forEach((state) => this.voiceSince.set(state.id, now));
    },

    // The time since the last hourly flush would be lost otherwise.
    hookForShutdown: async function () {
        await this.flushVoiceTime();
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
            ...Object.entries(PERIODS).map(([period, { schedule }]) => ({
                schedule,
                action: () => this.postTop10ToChannel(period),
            })),
        ];
    },
};

module.exports = myTop10;
