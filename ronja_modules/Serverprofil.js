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
const { playerLimit } = require("../core/gameList.js");

// A profile lists the member's top genres of the games they played in the
// last 100 days, and their games played in the last 30 days - plus, on
// someone else's profile, the games you both played in the last 100 days
// (the same window /lfg pings use), marked as shared. Most recently played
// by the member first, at most 20, split over as many fields as they need.
const GENRES_DAYS = 100;
const GENRES_SHOWN = 3;
const RECENT_GAMES_DAYS = 30;
const SHARED_GAMES_DAYS = 100;
const GAMES_SHOWN = 20;
const FIELD_MAX_LENGTH = 1024; // Discord's limit for a field value.
// Shared multiplayer games are ones to play together, shared single-player
// games still something to talk about.
const SHARED_MULTIPLAYER_ICON = "🤝";
const SHARED_SINGLE_PLAYER_ICON = "💬";

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

            let played = await this.playedGames(
                m.id,
                Math.max(GENRES_DAYS, RECENT_GAMES_DAYS, SHARED_GAMES_DAYS)
            );

            let genres = this.favoriteGenres(
                played.filter((g) => g.lastplayed >= this.daysAgo(GENRES_DAYS))
            );
            if (genres.length) {
                e.addFields([
                    {
                        name: this.l(locale, "Favorite genres"),
                        value: genres.map((genre) => this.l(locale, genre)).join(", "),
                    },
                ]);
            }

            let shared = new Set();
            if (interaction.member.id != m.id) {
                let own = await this.playedGames(interaction.member.id, SHARED_GAMES_DAYS);
                shared = new Set(own.map((g) => g.game.id));
            }
            let games = played.filter((g) =>
                shared.has(g.game.id)
                    ? g.lastplayed >= this.daysAgo(SHARED_GAMES_DAYS)
                    : g.lastplayed >= this.daysAgo(RECENT_GAMES_DAYS)
            );
            if (games.length) {
                e.addFields(this.gameFields(locale, games, shared));
                let legend = this.sharedLegend(locale, games.slice(0, GAMES_SHOWN), shared);
                if (legend) e.setFooter({ text: legend });
            }

            interaction.editReply({ embeds: [e] });
        }
    },

    daysAgo: function (days) {
        return DateTime.now().setZone(this.cfg("timezone")).minus({ days }).toJSDate();
    },

    // The games `member` played in the last `days` days, as [{ game, lastplayed }],
    // most recently played first.
    playedGames: async function (member, days) {
        let statuses = await this.client.db.GameStatus.findAll({
            where: { member, lastplayed: { [Op.gte]: this.daysAgo(days) } },
            include: [{ model: this.client.db.Game }],
        });

        // Grouped by the joined game's id, not s.GameId: the migrations named
        // that column "gameId", which SQLite then returns instead.
        let games = new Map();
        for (let s of statuses) {
            let g = games.get(s.Game.id);
            if (!g || s.lastplayed > g.lastplayed) {
                games.set(s.Game.id, { game: s.Game, lastplayed: s.lastplayed });
            }
        }

        return [...games.values()].sort(
            (a, b) => b.lastplayed - a.lastplayed || a.game.name.localeCompare(b.game.name)
        );
    },

    // The IGDB genre names most of `games` (see playedGames) have, at most
    // GENRES_SHOWN - on a tie, the genre played most recently first. Games
    // without genre data don't count.
    favoriteGenres: function (games) {
        let counts = new Map();
        for (let { game } of games) {
            for (let genre of game.genres ? JSON.parse(game.genres) : []) {
                counts.set(genre, (counts.get(genre) ?? 0) + 1);
            }
        }
        // Sorting is stable, and `games` is most recently played first.
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, GENRES_SHOWN)
            .map(([genre]) => genre);
    },

    sharedIcon: function (game) {
        return game.singlePlayerOnly ? SHARED_SINGLE_PLAYER_ICON : SHARED_MULTIPLAYER_ICON;
    },

    // One line per game and when the member last played it, in the viewer's
    // own locale and timezone. Games in `shared` (game ids) get their icon,
    // multiplayer ones also their player limit. At most GAMES_SHOWN games,
    // split over as many fields as they need.
    gameFields: function (locale, games, shared) {
        let lines = games.slice(0, GAMES_SHOWN).map(({ game, lastplayed }) => {
            let isShared = shared.has(game.id);
            let icon = isShared ? `${this.sharedIcon(game)} ` : "";
            let limit =
                isShared && !game.singlePlayerOnly
                    ? playerLimit(this.client, locale, game.onlineMaxPlayers)
                    : "";
            return `${icon}${game.name}${limit} (${time(lastplayed, TimestampStyles.RelativeTime)})`;
        });
        if (games.length > GAMES_SHOWN) {
            lines.push(this.l(locale, "...and %d more", games.length - GAMES_SHOWN));
        }

        let values = [];
        for (let line of lines) {
            let last = values.length - 1;
            if (last >= 0 && values[last].length + 1 + line.length <= FIELD_MAX_LENGTH) {
                values[last] += `\n${line}`;
            } else {
                values.push(line);
            }
        }
        return values.map((value, i) => ({
            name: i === 0 ? this.l(locale, "Recently played") : "\u200b",
            value,
        }));
    },

    // Explains the shared icons that `games` (the ones shown) use, or "" if none.
    sharedLegend: function (locale, games, shared) {
        let icons = new Set(
            games.filter((g) => shared.has(g.game.id)).map((g) => this.sharedIcon(g.game))
        );
        let legend = [];
        if (icons.has(SHARED_MULTIPLAYER_ICON)) {
            legend.push(`${SHARED_MULTIPLAYER_ICON} ${this.l(locale, "You both play it")}`);
        }
        if (icons.has(SHARED_SINGLE_PLAYER_ICON)) {
            legend.push(
                `${SHARED_SINGLE_PLAYER_ICON} ${this.l(locale, "You both play it (single-player)")}`
            );
        }
        return legend.join(" · ");
    },
};

module.exports = myServerprofil;
