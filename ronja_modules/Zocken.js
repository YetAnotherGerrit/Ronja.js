const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonStyle,
    Colors,
    GuildScheduledEventPrivacyLevel,
    GuildScheduledEventEntityType,
    GuildScheduledEventStatus,
    ChannelType,
    SlashCommandBuilder,
    MessageFlags,
    RESTJSONErrorCodes,
} = require("discord.js");
const { DateTime } = require("luxon");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const { multiplayerGamesWhere, countDistinctPlayers, playerLimit } = require("../core/gameList.js");

const myZocken = {
    commands: [
        new SlashCommandBuilder()
            .setName("lfg")
            .setNameLocalizations({ de: "zocken" })
            .setDescription("You want to game and need fellow gamers?")
            .setDescriptionLocalizations({
                de: "Du willst was zocken und suchst Mitspieler?",
            })
            .addStringOption((option) =>
                option
                    .setName("day")
                    .setNameLocalizations({ de: "tag" })
                    .setDescription("Select the day you want to play.")
                    .setDescriptionLocalizations({
                        de: "Wähle den Tag an dem du zocken möchtest.",
                    })
                    .setRequired(false)
                    .addChoices(
                        {
                            name: "Today",
                            value: "today",
                            name_localizations: { de: "Heute" },
                        },
                        {
                            name: "Tomorrow",
                            value: "tomorrow",
                            name_localizations: { de: "Morgen" },
                        }
                    )
            )
            .addStringOption((option) =>
                option
                    .setName("time")
                    .setNameLocalizations({ de: "uhrzeit" })
                    .setDescription(
                        "Select the time you want to play (HH:MM). Use 24h time format."
                    )
                    .setDescriptionLocalizations({
                        de: "Setze die Uhrzeit zu der du spielen möchtest (SS:MM).",
                    })
                    .setRequired(false)
            )
            .addStringOption((option) =>
                option
                    .setName("title")
                    .setNameLocalizations({ de: "titel" })
                    .setDescription("Give your gaming session a name.")
                    .setDescriptionLocalizations({
                        de: "Gib deinem /zocken-Aufruf einen Namen.",
                    })
                    .setRequired(false)
            )
            .setDMPermission(false),
    ],

    // How long a quick session's post stays up and the ping settings menu stays usable.
    // Below 15 minutes, as the menu's interaction token expires then.
    timeout: 10 * 60 * 1000,
    // The collectors of the open quick sessions (/lfg without a day or time), by their
    // host's ID. In memory only: after a restart, a click on a leftover post removes it.
    quickSessions: new Map(),
    dbVoiceStatus: {},
    // A zero-width marker appended to the location of game-specific /lfg events, so they can be
    // told apart later regardless of guild locale: the translated location text (e.g. "for"/"für"/
    // "para"/...) isn't a reliable signal, since every language translates it differently.
    gameSpecificMarker: "​",

    createZockenTextForEvent: async function (lng, guildEvent, guildEventCreatorId) {
        let eventMembers = [];
        let regexResult;

        if (guildEvent) {
            let eventSubcribers = await guildEvent.fetchSubscribers({
                withMember: true,
            });

            await Promise.all(
                eventSubcribers.map(async (eventSubcriber) =>
                    eventMembers.push(eventSubcriber.member.id)
                )
            );

            let regex = new RegExp(/\((\d+)\)/);

            regexResult = guildEvent.entityMetadata.location.match(regex);
        }

        if (regexResult) {
            if (!eventMembers.includes(regexResult[1])) eventMembers.push(regexResult[1]);
        }

        if (guildEventCreatorId) eventMembers.push(guildEventCreatorId);

        return (
            (await this.createZockenText(lng, eventMembers)) ||
            this.l(
                lng,
                'Nobody is participating yet. Don\'t forget to click that "Interested"-Button!'
            )
        );
    },

    // The multiplayer games the members played, most played by them first.
    // With `players`, games whose player limit is lower than that are flagged.
    createZockenText: async function (lng, zockenMembers, players = 0) {
        if (zockenMembers.length === 0) return null;

        let gamesPlayed = await this.client.db.Game.findAll({
            raw: true,
            attributes: ["name", "onlineMaxPlayers", [countDistinctPlayers, "playerCount"]],
            where: multiplayerGamesWhere,
            include: [
                {
                    model: this.client.db.GameStatus,
                    where: {
                        member: zockenMembers,
                    },
                },
            ],
            order: [
                [countDistinctPlayers, "DESC"],
                [this.client.db.GameStatus, "lastplayed", "DESC"],
            ],
            group: "Game.name",
        });

        return gamesPlayed
            .slice(0, 10)
            .map(
                (gamePlayed) =>
                    ":bust_in_silhouette:".repeat(gamePlayed.playerCount) +
                    " " +
                    gamePlayed.name +
                    playerLimit(this.client, lng, gamePlayed.onlineMaxPlayers, players)
            )
            .join("\n");
    },

    // Members of the channel to ping: who has a game in common with the command's
    // member and wants a ping right now. Nobody in `alreadyIn` is pinged; it always
    // includes the command's member, who never has a game in common with themselves.
    createChannelMemberPing: async function (interaction, alreadyIn = [interaction.member.id]) {
        let channelMemberPing = "";

        await Promise.all(
            interaction.channel.members.map(async (channelMember) => {
                if (channelMember.user.bot || alreadyIn.includes(channelMember.id)) return;

                let result = await this.client.db.MemberSetting.findOne({
                    where: { memberid: channelMember.id, name: "zockenmention" },
                });
                let statusChannelMember = result ? parseInt(result.value) : 1;

                // 0: never ping, 1: only while online or idle, 2: also while offline.
                // Members without a presence are offline; do not disturb is never pinged.
                let presence = channelMember.presence?.status ?? "offline";
                let wantsPing =
                    ((presence === "online" || presence === "idle") && statusChannelMember > 0) ||
                    (presence === "offline" && statusChannelMember > 1);
                if (!wantsPing) return;

                let gamesPlayed = await this.client.db.Game.findAll({
                    raw: true,
                    attributes: ["name", [countDistinctPlayers, "playerCount"]],
                    where: multiplayerGamesWhere,
                    include: [
                        {
                            model: this.client.db.GameStatus,
                            where: {
                                member: [interaction.member.id, channelMember.id],
                                lastplayed: {
                                    [Op.gte]: DateTime.now()
                                        .setZone(this.cfg("timezone"))
                                        .minus({ days: 100 })
                                        .toJSDate(),
                                },
                            },
                        },
                    ],
                    group: "Game.name",
                });
                // playerCount is how many of the two members played the game in the last 100
                // days, so 2 means both did: ping only if they have a game in common.
                if (!gamesPlayed.some((gamePlayed) => gamePlayed.playerCount === 2)) return;

                channelMemberPing = channelMemberPing.concat(` <@${channelMember.id}>`);
            })
        );

        return channelMemberPing;
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "lfg") return;

        if (interaction.options.getString("day") && !interaction.options.getString("time")) {
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "When you choose a day, you'll also need to specify a time!"
                            )
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        let channelGame = await this.client.db.Game.findOne({
            where: { channel: interaction.channel.id },
        });

        // No time, and so no day (a day alone was rejected above): a quick session.
        if (!interaction.options.getString("time")) {
            await this.startQuickSession(interaction, channelGame);
            return;
        }

        let regex = new RegExp(/(\d{2}):(\d{2})/);

        let regexResult = interaction.options.getString("time").match(regex);

        if (!regexResult) {
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "Please choose a valid time: HH:MM (24-hour time format)."
                            )
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (regexResult[1] < 0 || regexResult[1] > 23) {
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "Please choose a valid time: HH:MM. Hour needs to be within 0-23."
                            )
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (regexResult[2] < 0 || regexResult[2] > 59) {
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "Please choose a valid time: HH:MM. Minute needs to be within 0-59."
                            )
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        let startTime = DateTime.fromObject(
            { hour: regexResult[1], minute: regexResult[2] },
            { zone: this.cfg("timezone") }
        );

        if (interaction.options.getString("day") == "tomorrow") {
            startTime = startTime.plus({ days: 1 });
        }

        if (startTime.diff(DateTime.now(), "minutes").minutes < 5) {
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "The chosen time and day need to be at least 5 minutes in the future."
                            )
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Deferred instead of replying right away: the reply that replaces the deferral
        // notifies the pings in its text, while mentions added by a later edit don't.
        await interaction.deferReply();

        let newEvent;
        try {
            newEvent = await interaction.guild.scheduledEvents.create({
                name:
                    interaction.options.getString("title") ||
                    this.l(
                        interaction.locale,
                        "%s's gaming session",
                        interaction.member.displayName
                    ),
                scheduledStartTime: startTime.toJSDate(),
                scheduledEndTime: startTime.plus({ hours: 1 }).toJSDate(), // Optional, but not for EXTERNAL
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: channelGame
                    ? this.l(
                          interaction.locale,
                          "%s wants to play %s. Who wants to join?",
                          interaction.member.displayName,
                          channelGame.name
                      )
                    : await this.createZockenTextForEvent(
                          interaction.locale,
                          null,
                          interaction.member.id
                      ), // Optional
                entityMetadata: {
                    location: channelGame
                        ? this.l(
                              interaction.locale,
                              "#%s via /lfg for %s by %s (%s)",
                              interaction.channel.name,
                              channelGame.name,
                              interaction.member.displayName,
                              interaction.member.id
                          ) + this.gameSpecificMarker
                        : this.l(
                              interaction.locale,
                              "#%s via /lfg by %s (%s)",
                              interaction.channel.name,
                              interaction.member.displayName,
                              interaction.member.id
                          ),
                }, // Optional, but not for EXTERNAL,
            });
        } catch (err) {
            console.error(err);
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "Something went wrong while creating the event. Please try again."
                            )
                        ),
                ],
            });
            return;
        }

        let channelMemberPing = await this.createChannelMemberPing(interaction);

        await interaction.editReply({
            // The event URL must stay in a plain message, not an embed: Discord does not
            // render the event link preview correctly when it's inside embed content.
            content: this.l(
                interaction.locale,
                "Hey%s and everyone else! (%s)",
                channelMemberPing,
                newEvent.url
            ),
            // Not redundant: without an explicit empty list, Discord doesn't show the
            // event's preview card under the link.
            embeds: [],
            components: [
                new ActionRowBuilder().addComponents(this.pingInfoButton(interaction.locale)),
            ],
        });
    },

    // The 🔔 button under /lfg's posts, answered with the ping settings menu.
    pingInfoButton: function (locale) {
        return this.client
            .myButton("🔔")
            .setCustomId("zockenSelect")
            .setLabel(this.l(locale, "Why is my name (not) in here?"))
            .setStyle(ButtonStyle.Secondary);
    },

    // /lfg without a day or time: a post that members join or leave with its
    // buttons, instead of an event. It's removed without a word after the timeout.
    startQuickSession: async function (interaction, channelGame) {
        let hostId = interaction.member.id;
        // One quick session per member: a new one replaces the previous one.
        this.quickSessions.get(hostId)?.stop();

        // The host is in, and so is everyone in their voice channel.
        let participants = new Set([hostId]);
        interaction.member.voice.channel?.members.forEach((member) => {
            if (!member.user.bot) participants.add(member.id);
        });

        let session = {
            hostName: interaction.member.displayName,
            participants,
            locale: interaction.locale,
            title: interaction.options.getString("title"),
            gameName: channelGame?.name,
        };

        // Deferred, as finding whom to ping can take a while. The reply that replaces
        // the deferral still notifies the mentions in its text (embeds never do).
        await interaction.deferReply();
        let ping = await this.createChannelMemberPing(interaction, [...participants]);
        let message = await interaction.editReply({
            content: ping.trim() || null,
            embeds: [await this.quickSessionEmbed(session)],
            components: [
                new ActionRowBuilder().addComponents(
                    this.client
                        .myButton("✅")
                        .setCustomId("zockenIn")
                        .setLabel(this.l(session.locale, "I'm in!"))
                        .setStyle(ButtonStyle.Success),
                    this.client
                        .myButton("👋")
                        .setCustomId("zockenOut")
                        .setLabel(this.l(session.locale, "Not now"))
                        .setStyle(ButtonStyle.Secondary),
                    this.pingInfoButton(session.locale)
                ),
            ],
        });

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.customId === "zockenIn" || i.customId === "zockenOut",
            time: this.timeout,
        });
        this.quickSessions.set(hostId, collector);

        collector.on("collect", async (buttonInteraction) => {
            // Not awaited by anyone: catch, or an error would end the process.
            try {
                // The host calls it off.
                if (
                    buttonInteraction.customId === "zockenOut" &&
                    buttonInteraction.user.id === hostId
                ) {
                    await buttonInteraction.deferUpdate();
                    collector.stop();
                    return;
                }
                if (buttonInteraction.customId === "zockenIn")
                    participants.add(buttonInteraction.user.id);
                else participants.delete(buttonInteraction.user.id);
                await buttonInteraction.update({ embeds: [await this.quickSessionEmbed(session)] });
            } catch (err) {
                console.error(err);
            }
        });

        collector.on("end", (collected, reason) => {
            if (this.quickSessions.get(hostId) === collector) this.quickSessions.delete(hostId);
            // After the timeout, or stopped as the host left or started a new session -
            // otherwise the post (or its channel) is gone already.
            if (reason !== "time" && reason !== "user") return;
            message.delete().catch((err) => {
                // Someone deleted it in the meantime.
                if (err.code !== RESTJSONErrorCodes.UnknownMessage) console.error(err);
            });
        });
    },

    quickSessionEmbed: async function (session) {
        let participants = [...session.participants];
        return new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(
                session.title || this.l(session.locale, "%s's gaming session", session.hostName)
            )
            .setDescription(
                session.gameName
                    ? this.l(
                          session.locale,
                          "%s wants to play %s. Who wants to join?",
                          session.hostName,
                          session.gameName
                      )
                    : (await this.createZockenText(
                          session.locale,
                          participants,
                          participants.length
                      )) || null
            )
            .addFields({
                name: this.l(session.locale, "Who's in"),
                value: participants.map((id) => `<@${id}>`).join(", "),
            });
    },

    hookForButtonInteraction: async function (interaction) {
        if (interaction.customId === "zockenIn" || interaction.customId === "zockenOut") {
            // The session's collector handles the click. Without one, the post is left
            // over from before a restart: remove it.
            let messageId = interaction.message.id;
            if ([...this.quickSessions.values()].some((c) => c.messageId === messageId)) return;
            await interaction.deferUpdate();
            await interaction.deleteReply();
            return;
        }
        if (interaction.customId !== "zockenSelect") return;

        let [mem] = await this.client.myFindOrCreate(this.client.db.MemberSetting, {
            where: { memberid: interaction.member.id, name: "zockenmention" },
            defaults: { value: "1" },
        });

        let statusZockenSelect = parseInt(mem.value);
        let statusZockenSelectText = "";

        switch (statusZockenSelect) {
            case 2:
                statusZockenSelectText = this.l(interaction.locale, "Ping me also offline.");
                break;

            case 1:
                statusZockenSelectText = this.l(
                    interaction.locale,
                    "Ping me only, when I am online."
                );
                break;

            case 0:
                statusZockenSelectText = this.l(interaction.locale, "Please, never ping me.");
                break;
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(this.l(interaction.locale, "Why is my name (not) in here?"))
                    .setDescription(
                        this.l(
                            interaction.locale,
                            "You are notified if you both played at least one mutual multiplayer game within the last 100 days. If you don't want to receive those notifications, you can change that now.\n\nYour current setting:\n> %s",
                            statusZockenSelectText
                        )
                    ),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("zockenSelected")
                        .setPlaceholder(this.l(interaction.locale, "Notifications..."))
                        .addOptions([
                            {
                                label: this.l(interaction.locale, "Ping me also offline."),
                                description: this.l(
                                    interaction.locale,
                                    "Also notify myself that someone wants to game, even when I am offline."
                                ),
                                value: "2",
                            },
                            {
                                label:
                                    this.l(interaction.locale, "Ping me only, when I am online.") +
                                    this.l(interaction.locale, " (Default)"),
                                description: this.l(
                                    interaction.locale,
                                    "Notify myself only when I am also online in Discord."
                                ),
                                value: "1",
                            },
                            {
                                label: this.l(interaction.locale, "Please, never ping me."),
                                description: this.l(
                                    interaction.locale,
                                    "I am not interested in this kind of gaming requests."
                                ),
                                value: "0",
                            },
                        ])
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        let myReply = await interaction.fetchReply();

        let collector = myReply.createMessageComponentCollector({
            time: this.timeout,
        });

        collector.on("collect", async (selectInteraction) => {
            if (selectInteraction.customId === "zockenSelected") {
                await this.client.db.MemberSetting.update(
                    { value: selectInteraction.values[0] },
                    { where: { memberid: selectInteraction.member.id, name: "zockenmention" } }
                );

                await selectInteraction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setTitle(this.l(interaction.locale, "Succesful!"))
                            .setDescription(
                                this.l(interaction.locale, "Your settings have been saved.")
                            ),
                    ],
                    components: [],
                });
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size == 0) {
                // Not awaited by anyone: catch, or a failed edit would end the process.
                await interaction
                    .editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(Colors.Blue)
                                .setTitle(this.l(interaction.locale, "Expired!"))
                                .setDescription(
                                    this.l(interaction.locale, "No changes have been saved.")
                                ),
                        ],
                        components: [],
                    })
                    .catch(console.error);
            }
        });
    },

    hookForEventUserUpdate: async function (guildScheduledEvent, user) {
        if (guildScheduledEvent.entityMetadata.location.includes(this.gameSpecificMarker)) {
            return;
        }
        if (guildScheduledEvent.entityMetadata.location.includes("/lfg")) {
            let guildDescription = await this.createZockenTextForEvent(
                guildScheduledEvent.guild.preferredLocale,
                guildScheduledEvent
            );
            guildScheduledEvent.setDescription(guildDescription);
        }
    },

    hookForEventStart: async function (oldGuildScheduledEvent, newGuildScheduledEvent) {
        if (newGuildScheduledEvent.entityMetadata.location.includes("/lfg")) {
            let eventSubcribers = await newGuildScheduledEvent.fetchSubscribers();
            if (eventSubcribers.size < 2) {
                newGuildScheduledEvent.setStatus(
                    GuildScheduledEventStatus.Completed,
                    "Not enough participants."
                );
            }
        }
    },

    hookForVoiceUpdate: async function (oldState, newState) {
        if (newState.channel) this.updateChannelVoiceStatus(newState.channel);
        if (
            (oldState.channel && !newState.channel) ||
            (oldState.channel && newState.channel && oldState.channel.id != newState.channel.id)
        )
            this.updateChannelVoiceStatus(oldState.channel);
    },

    updateChannelVoiceStatus: async function (channel) {
        if (
            !channel ||
            channel.type !== ChannelType.GuildVoice ||
            channel.userLimit !== 0 ||
            channel.members.size === 0
        )
            return;

        if (!this.dbVoiceStatus[channel.id]) {
            this.dbVoiceStatus[channel.id] = await channel.send(
                this.l(
                    channel.guild.preferredLocale,
                    "Open the voice channel's text channel to see what games the members can play..."
                )
            );
        }

        let myMsg = this.dbVoiceStatus[channel.id];
        let voiceMembers = [];

        channel.members.forEach((member) => {
            voiceMembers.push(member.id);
        });
        let players = channel.members.filter((member) => !member.user.bot).size;

        myMsg
            .edit(
                this.l(
                    channel.guild.preferredLocale,
                    "This games are played by the channel members:\n"
                ) +
                    (await this.createZockenText(
                        channel.guild.preferredLocale,
                        voiceMembers,
                        players
                    ))
            )
            .catch(console.error);
    },
};

module.exports = myZocken;
