const {
    EmbedBuilder,
    Colors,
    SlashCommandBuilder,
    MessageFlags,
    GuildScheduledEventRecurrenceRuleFrequency,
    GuildScheduledEventRecurrenceRuleWeekday,
    GuildScheduledEventStatus,
} = require("discord.js");
const { default: iCal } = require("ical-generator");
const sFftpClient = require("ssh2-sftp-client");

const RRULE_FREQUENCY_BY_DISCORD_FREQUENCY = {
    [GuildScheduledEventRecurrenceRuleFrequency.Yearly]: "YEARLY",
    [GuildScheduledEventRecurrenceRuleFrequency.Monthly]: "MONTHLY",
    [GuildScheduledEventRecurrenceRuleFrequency.Weekly]: "WEEKLY",
    [GuildScheduledEventRecurrenceRuleFrequency.Daily]: "DAILY",
};

const RRULE_WEEKDAY_BY_DISCORD_WEEKDAY = {
    [GuildScheduledEventRecurrenceRuleWeekday.Monday]: "MO",
    [GuildScheduledEventRecurrenceRuleWeekday.Tuesday]: "TU",
    [GuildScheduledEventRecurrenceRuleWeekday.Wednesday]: "WE",
    [GuildScheduledEventRecurrenceRuleWeekday.Thursday]: "TH",
    [GuildScheduledEventRecurrenceRuleWeekday.Friday]: "FR",
    [GuildScheduledEventRecurrenceRuleWeekday.Saturday]: "SA",
    [GuildScheduledEventRecurrenceRuleWeekday.Sunday]: "SU",
};

function buildICalRecurrenceRule(discordRecurrenceRule) {
    if (!discordRecurrenceRule) {
        return undefined;
    }

    const ruleParts = [
        "FREQ=" + RRULE_FREQUENCY_BY_DISCORD_FREQUENCY[discordRecurrenceRule.frequency],
    ];

    if (discordRecurrenceRule.interval > 1) {
        ruleParts.push("INTERVAL=" + discordRecurrenceRule.interval);
    }

    const byDay = [
        ...(discordRecurrenceRule.byWeekday ?? []).map(
            (weekday) => RRULE_WEEKDAY_BY_DISCORD_WEEKDAY[weekday]
        ),
        ...(discordRecurrenceRule.byNWeekday ?? []).map(
            (nWeekday) => nWeekday.n + RRULE_WEEKDAY_BY_DISCORD_WEEKDAY[nWeekday.day]
        ),
    ];
    if (byDay.length > 0) {
        ruleParts.push("BYDAY=" + byDay.join(","));
    }

    if (discordRecurrenceRule.byMonth?.length > 0) {
        ruleParts.push("BYMONTH=" + discordRecurrenceRule.byMonth.join(","));
    }
    if (discordRecurrenceRule.byMonthDay?.length > 0) {
        ruleParts.push("BYMONTHDAY=" + discordRecurrenceRule.byMonthDay.join(","));
    }
    if (discordRecurrenceRule.byYearDay?.length > 0) {
        ruleParts.push("BYYEARDAY=" + discordRecurrenceRule.byYearDay.join(","));
    }
    if (discordRecurrenceRule.count) {
        ruleParts.push("COUNT=" + discordRecurrenceRule.count);
    }

    return ruleParts.join(";");
}

const myICalFeed = {
    commands: [
        new SlashCommandBuilder()
            .setName("ical")
            .setDescription("Get an ical-feed of your events.")
            .setDescriptionLocalizations({
                de: "Erstelle einen ical-Feed für deine Events.",
            })
            .setDMPermission(false),
    ],

    updateICalFile: async function (guild, user) {
        let scheduledEvents = await guild.scheduledEvents.fetch({
            cache: true,
        });
        let iCalendar = new iCal({ name: "Discord Events" });

        let myFtp = new sFftpClient();

        await Promise.all(
            scheduledEvents.map(async (guildEvent) => {
                let eventSubcribers = await guildEvent.fetchSubscribers();
                let myRepeating = buildICalRecurrenceRule(guildEvent.recurrenceRule);

                await Promise.all(
                    eventSubcribers.map(async (eventSubcriber) => {
                        if (eventSubcriber.user.id == user.id) {
                            iCalendar.createEvent({
                                id: guildEvent.id,
                                start: guildEvent.scheduledStartAt,
                                end: guildEvent.scheduledEndAt,
                                summary: "Discord: " + guildEvent.name,
                                description:
                                    guildEvent.description +
                                    "\n" +
                                    guildEvent.entityMetadata.location +
                                    "\n" +
                                    guildEvent.url,
                                repeating: myRepeating,
                            });
                        }
                    })
                );
            })
        );

        let buff = Buffer.from(iCalendar.toString(), "utf-8");

        // Every event (un)subscription uploads a feed, so the connection must
        // be closed again - also when connecting or uploading fails.
        try {
            await myFtp.connect({
                host: this.cfg("icalFtpServer"),
                port: this.cfg("icalFtpPort") || 22,
                username: this.cfg("icalFtpUsername"),
                password: this.cfg("icalFtpPassword"),
            });

            await myFtp.put(buff, user.id + ".ics");
        } finally {
            await myFtp
                .end()
                .catch((err) => console.error("Could not close the SFTP connection:", err));
        }
    },

    isIcalConfigured: function () {
        return (
            this.cfg("icalFtpServer") &&
            this.cfg("icalFtpUsername") &&
            this.cfg("icalFtpPassword") &&
            this.cfg("icalUrl")
        );
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "ical") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!this.isIcalConfigured()) {
            await this.reply(
                interaction,
                Colors.Red,
                this.l(interaction.locale, "The ical-settings for this server are incomplete.")
            );
            return;
        }

        try {
            await this.updateICalFile(interaction.guild, interaction.user);
        } catch (err) {
            console.error(`Could not update the ical feed of ${interaction.user.id}:`, err);
            await this.reply(
                interaction,
                Colors.Red,
                this.l(
                    interaction.locale,
                    "Your ical feed couldn't be updated right now, please try again later."
                )
            );
            return;
        }

        await this.reply(
            interaction,
            Colors.Blue,
            this.cfg("icalUrl") + interaction.user.id + ".ics"
        );
    },

    reply: async function (interaction, color, message) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(color).setDescription(message)],
        });
    },

    hookForEventUserUpdate: async function (oGuildScheduledEvent, oUser) {
        if (this.isIcalConfigured()) this.updateICalFile(oGuildScheduledEvent.guild, oUser);
    },

    hookForEventUpdate: async function (oldGuildScheduledEvent, newGuildScheduledEvent) {
        if (
            newGuildScheduledEvent.status == GuildScheduledEventStatus.Canceled &&
            this.isIcalConfigured()
        ) {
            let eventSubcribers = await newGuildScheduledEvent.fetchSubscribers();
            await Promise.all(
                eventSubcribers.map((eventSubcriber) =>
                    this.updateICalFile(newGuildScheduledEvent.guild, eventSubcriber.user)
                )
            );
        }
    },
};

module.exports = myICalFeed;
