const {
    EmbedBuilder,
    Colors,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    MessageFlags,
    TimestampStyles,
    time,
} = require("discord.js");
const { DateTime } = require("luxon");
const { Op } = require("sequelize");
const { multiplayerGamesWhere, playerLimit } = require("../core/gameList.js");

// What a profile lists: the member's games played in the last 30 days, and
// the multiplayer games both of you played in the last 100 days (the same
// window /lfg pings use) - each most recently played first, at most 10.
const RECENT_GAMES_DAYS = 30;
const COMMON_GAMES_DAYS = 100;
const GAMES_SHOWN = 10;
const FIELD_MAX_LENGTH = 1024; // Discord's limit for a field value.

const myServerprofil = {
    commands: [
        new ContextMenuCommandBuilder()
            .setName("Serverprofile")
            .setNameLocalizations({ de: "Serverprofil" })
            .setType(ApplicationCommandType.User)
            .setDMPermission(false),
    ],

    hookForContextMenuInteraction: async function (interaction) {
        if (interaction.commandName == "Serverprofile") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            let m = await interaction.guild.members.fetch(interaction.options.getUser("user").id);
            let locale = interaction.locale;

            let e = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(this.l(locale, "Profile of %s", m.displayName))
                .setThumbnail(m.displayAvatarURL())
                .setDescription(
                    this.l(
                        locale,
                        `%s is on this discord server since %s.`,
                        m.displayName,
                        time(m.joinedAt, TimestampStyles.LongDate)
                    )
                );

            let recent = await this.lastPlayedGames([m.id], RECENT_GAMES_DAYS);
            if (recent.length) {
                e.addFields([
                    {
                        name: this.l(locale, "Recently played"),
                        value: this.gameLines(locale, recent),
                    },
                ]);
            }

            if (interaction.member.id != m.id) {
                let common = await this.lastPlayedGames(
                    [interaction.member.id, m.id],
                    COMMON_GAMES_DAYS,
                    multiplayerGamesWhere
                );
                if (common.length) {
                    e.addFields([
                        {
                            name: this.l(locale, "Common games"),
                            value: this.gameLines(locale, common, true),
                        },
                    ]);
                }
            }

            interaction.editReply({ embeds: [e] });
        }
    },

    // The games every one of `members` played in the last `days` days, as
    // [{ game, lastplayed }] with the last time any of them played it, most
    // recently played first.
    lastPlayedGames: async function (members, days, gameWhere = {}) {
        let statuses = await this.client.db.GameStatus.findAll({
            where: {
                member: members,
                lastplayed: {
                    [Op.gte]: DateTime.now()
                        .setZone(this.cfg("timezone"))
                        .minus({ days })
                        .toJSDate(),
                },
            },
            include: [{ model: this.client.db.Game, where: gameWhere }],
        });

        let games = new Map();
        for (let s of statuses) {
            let g = games.get(s.GameId) ?? {
                game: s.Game,
                lastplayed: s.lastplayed,
                members: new Set(),
            };
            if (s.lastplayed > g.lastplayed) g.lastplayed = s.lastplayed;
            g.members.add(s.member);
            games.set(s.GameId, g);
        }

        return [...games.values()]
            .filter((g) => g.members.size === members.length)
            .sort((a, b) => b.lastplayed - a.lastplayed || a.game.name.localeCompare(b.game.name));
    },

    // One line per game (with its player limit if `withLimit`) and when it
    // was last played, in the viewer's own locale and timezone - at most
    // GAMES_SHOWN of them, and as many as fit into a field.
    gameLines: function (locale, games, withLimit = false) {
        let lines = games.map(
            (g) =>
                g.game.name +
                (withLimit ? playerLimit(this.client, locale, g.game.onlineMaxPlayers) : "") +
                ` (${time(g.lastplayed, TimestampStyles.RelativeTime)})`
        );

        let shown = [];
        for (let i = 0; i < lines.length && shown.length < GAMES_SHOWN; i++) {
            let more =
                lines.length > i + 1
                    ? `\n${this.l(locale, "...and %d more", lines.length - i - 1)}`
                    : "";
            if ([...shown, lines[i]].join("\n").length + more.length > FIELD_MAX_LENGTH) break;
            shown.push(lines[i]);
        }

        let value = shown.join("\n");
        if (lines.length > shown.length) {
            value += `\n${this.l(locale, "...and %d more", lines.length - shown.length)}`;
        }
        return value;
    },
};

module.exports = myServerprofil;
