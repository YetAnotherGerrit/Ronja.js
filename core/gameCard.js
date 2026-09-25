const {
    EmbedBuilder,
    RESTJSONErrorCodes,
    TimestampStyles,
    channelMention,
    time,
    userMention,
} = require("discord.js");
const { DateTime } = require("luxon");
const { Op } = require("sequelize");

// Discord allows 6000 characters across all embeds of a message. These caps
// keep a card well below that, so it still fits next to another embed (e.g.
// a new channel notification).
const SUMMARY_MAX_LENGTH = 2000;
const LIST_MAX_LENGTH = 512;
const LINKS_MAX_LENGTH = 1024; // Discord's limit for a field value.

// The guild's players of a game, as short-lived cards (/gameinfo) list them:
// whoever played it in the last 100 days (the same window /lfg pings use),
// at most 10 of them.
const RECENT_PLAYERS_DAYS = 100;
const RECENT_PLAYERS_SHOWN = 10;

// The links a card shows, in this order, by the website type keys of the
// game details (see mapGameDetails in ronja_modules/IGDB.js). Only labels
// marked for it are translated, brand names aren't.
const LINKS = [
    ["official", "Official site", true],
    ["steam", "Steam"],
    ["epic", "Epic Games Store"],
    ["gog", "GOG"],
    ["itch", "itch.io"],
    ["wiki", "Wiki", true],
    ["reddit", "Reddit"],
    ["discord", "Discord"],
];

// What a card can show, in the order /settings offers it. The admin picks
// which of them are shown in the gameCardDetails setting.
const DETAILS = [
    ["cover", "Cover"],
    ["summary", "Summary"],
    ["releaseDate", "Release date"],
    ["platforms", "Platforms"],
    ["rating", "Rating"],
    ["genres", "Genres"],
    ["timeToBeat", "Time to beat"],
    ["multiplayer", "Multiplayer", "Or the game modes, if IGDB has no multiplayer details"],
    ["links", "Links"],
    ["players", "Players", "Who here played it recently, only in /gameinfo"],
    ["channel", "Text channel", "Its game text channel, only in /gameinfo"],
];

// The gameCardDetails choices for /settings (see hookForSettingOptions).
function gameCardDetailOptions(client, locale) {
    let l = (...args) => client.myTranslator(locale, ...args);
    return DETAILS.map(([value, label, description]) => ({
        value,
        label: l(label),
        ...(description ? { description: l(description) } : {}),
    }));
}

function shownDetails(client) {
    return (client.myConfigGet("gameCardDetails") || "").split(",");
}

function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Builds the card embed for a game's details, as returned by
// client.myGameDetails(game) - without a color, which is up to the caller.
// Shows the details the admin picked in the gameCardDetails setting, minus
// anything the details don't have. Title and IGDB link are always shown.
// For a game without details, pass just { name } - the card then has only
// its title (and the guild info, if any) and doesn't mention IGDB.
// The guild's players and the game's text channel are only shown with
// `guildInfo` (see loadGuildInfo), which only short-lived cards pass: pinned
// or notification cards stay up for weeks, while that info changes daily.
function buildGameCard(client, details, locale, guildInfo = null) {
    let l = (...args) => client.myTranslator(locale, ...args);
    let shown = shownDetails(client);
    let show = (detail) => shown.includes(detail);
    let e = new EmbedBuilder().setTitle(truncate(details.name, 256));

    if (details.id != null) e.setFooter({ text: "IGDB" });

    if (details.url) e.setURL(details.url);
    if (show("summary") && details.summary) {
        e.setDescription(truncate(details.summary, SUMMARY_MAX_LENGTH));
    }
    if (show("cover") && details.coverUrl) e.setThumbnail(details.coverUrl);

    let fields = [];
    let add = (detail, name, value, inline = true) => {
        if (show(detail) && value) fields.push({ name, value, inline });
    };
    let list = (items) => truncate((items || []).join(", "), LIST_MAX_LENGTH);

    add("releaseDate", l("Release date"), releaseDate(details.releaseDate));
    add("platforms", l("Platforms"), list(details.platforms));
    if (details.rating != null) {
        add("rating", l("Rating"), `${Math.round(details.rating)}/100`);
    }
    add("genres", l("Genres"), list(details.genres?.map((genre) => l(genre))));
    add("timeToBeat", l("Time to beat"), timeToBeatLines(l, details.timeToBeat));

    let multiplayer = multiplayerLines(l, details.multiplayer);
    if (multiplayer) add("multiplayer", l("Multiplayer"), multiplayer);
    else add("multiplayer", l("Game modes"), list(details.gameModes));

    add("links", l("Links"), links(l, details.websites), false);

    if (guildInfo?.players) {
        add("players", l("Recently played by"), playerLines(l, guildInfo.players), false);
    }
    if (guildInfo?.channel) {
        add("channel", l("Text channel"), channelLine(l, guildInfo.channel), false);
    }

    if (fields.length) e.addFields(fields);
    return e;
}

// The details' ISO date (e.g. "2021-03-25") as a Discord timestamp, which
// every viewer sees in their own language. Discord also shifts it into the
// viewer's timezone, so it points at noon UTC - the same calendar day from
// UTC-11 to UTC+11. Anything that isn't an ISO date is shown as it is.
function releaseDate(date) {
    if (!date) return null;
    let noon = DateTime.fromISO(date, { zone: "utc" }).set({ hour: 12 });
    return noon.isValid ? time(noon.toJSDate(), TimestampStyles.LongDate) : date;
}

function duration(l, seconds) {
    let hours = Math.round(seconds / 3600);
    return hours >= 1 ? l("%d h", hours) : l("%d min", Math.max(1, Math.round(seconds / 60)));
}

function timeToBeatLines(l, t) {
    if (!t) return null;
    return [
        t.hastily && l("Rushed: %s", duration(l, t.hastily)),
        t.normally && l("Normally: %s", duration(l, t.normally)),
        t.completely && l("Completionist: %s", duration(l, t.completely)),
    ]
        .filter(Boolean)
        .join("\n");
}

function multiplayerLines(l, m) {
    if (!m) return null;
    let upTo = (players, withCount, without) =>
        players > 1 ? l(withCount, players) : without && l(without);
    // Multiplayer for no more players than co-op allows adds nothing to the co-op line.
    let beyond = (players, coop, coopPlayers) => (players > (coop ? coopPlayers : 0) ? players : 0);

    let lines = [
        m.onlineCoop && upTo(m.onlineCoopMax, "Online co-op, up to %d players", "Online co-op"),
        upTo(
            beyond(m.onlineMax, m.onlineCoop, m.onlineCoopMax),
            "Online multiplayer, up to %d players"
        ),
        m.offlineCoop && upTo(m.offlineCoopMax, "Couch co-op, up to %d players", "Couch co-op"),
        upTo(
            beyond(m.offlineMax, m.offlineCoop, m.offlineCoopMax),
            "Local multiplayer, up to %d players"
        ),
        [
            m.lanCoop && l("LAN co-op"),
            m.splitscreen && l("Split screen"),
            m.campaignCoop && l("Co-op campaign"),
            m.dropIn && l("Drop-in/drop-out"),
        ]
            .filter(Boolean)
            .join(" · "),
    ];
    return lines.filter(Boolean).join("\n") || null;
}

// Links that don't fit into one field value are left out.
function links(l, websites) {
    let value = "";
    for (let [type, label, translate] of LINKS) {
        let site = (websites || []).find((w) => w.type === type);
        if (!site) continue;
        let link = `[${translate ? l(label) : label}](${site.url})`;
        let next = value ? `${value} · ${link}` : link;
        if (next.length <= LINKS_MAX_LENGTH) value = next;
    }
    return value;
}

// What a short-lived card for `game` (a Game row, or null for a game Ronja
// doesn't track) shows about `guild` (see buildGameCard): only the parts the
// gameCardDetails setting shows are looked up, the others are left undefined.
// - players: the members still in the guild who played it recently, most
//   recent first, as [{ id, lastplayed }] - empty if Ronja doesn't track it.
// - channel: its game text channel as { active: id } or { archived: name },
//   or { missing: n } with the number of players it needs to get one - or
//   null if game text channels aren't set up or its channel can't be read.
async function loadGuildInfo(client, guild, game) {
    let shown = shownDetails(client);
    let info = {};
    if (shown.includes("players")) info.players = await recentPlayers(client, guild, game);
    if (shown.includes("channel")) info.channel = await textChannel(client, guild, game);
    return info;
}

function playedSince(client, days) {
    return DateTime.now()
        .setZone(client.myConfigGet("timezone"))
        .minus({ days: Number(days) })
        .toJSDate();
}

async function recentPlayers(client, guild, game) {
    if (!game) return [];
    let statuses = await client.db.GameStatus.findAll({
        where: {
            GameId: game.id,
            lastplayed: { [Op.gte]: playedSince(client, RECENT_PLAYERS_DAYS) },
        },
        order: [["lastplayed", "DESC"]],
    });
    let stillHere = await Promise.all(statuses.map((s) => isMember(guild, s.member)));
    return statuses
        .filter((s, i) => stillHere[i])
        .map((s) => ({ id: s.member, lastplayed: s.lastplayed }));
}

async function isMember(guild, id) {
    try {
        await guild.members.fetch(id);
        return true;
    } catch (err) {
        let gone = [RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser];
        if (!gone.includes(err.code)) console.warn(`Could not look up member ${id}:`, err);
        return false;
    }
}

// Mirrors how DynamicTextChannels creates and archives game text channels.
async function textChannel(client, guild, game) {
    let cfg = (name) => client.myConfigGet(name);
    if (!cfg("dtcGamesCategory") || !cfg("dtcArchivedGamesCategory")) return null;

    if (game?.channel) {
        try {
            let channel = await guild.channels.fetch(game.channel);
            return channel.parentId === cfg("dtcArchivedGamesCategory")
                ? { archived: channel.name }
                : { active: channel.id };
        } catch (err) {
            if (err.code !== RESTJSONErrorCodes.UnknownChannel) {
                console.warn(`Could not look up the text channel of ${game.name}:`, err);
                return null;
            }
            // Deleted while Ronja was offline - DynamicTextChannels forgets it
            // the next time someone plays the game, which is then channel-less.
        }
    }

    let players = game
        ? await client.db.GameStatus.count({
              where: {
                  GameId: game.id,
                  lastplayed: {
                      [Op.gte]: playedSince(client, cfg("dtcDaysRelevantForCreation")),
                  },
              },
          })
        : 0;
    return { missing: Math.max(0, Number(cfg("dtcMinimumPlayersForCreation")) - players) };
}

function playerLines(l, players) {
    if (!players.length) return l("Nobody here has played it recently.");
    let list = players
        .slice(0, RECENT_PLAYERS_SHOWN)
        .map((p) => `${userMention(p.id)} (${time(p.lastplayed, TimestampStyles.RelativeTime)})`)
        .join(", ");
    if (players.length > RECENT_PLAYERS_SHOWN) {
        list += ` ${l("...and %d more", players.length - RECENT_PLAYERS_SHOWN)}`;
    }
    return list;
}

function channelLine(l, channel) {
    if (channel.active) return channelMention(channel.active);
    if (channel.archived) return l("#%s is archived.", channel.archived);
    if (channel.missing === 0) return l("It gets its own channel the next time someone plays it.");
    if (channel.missing === 1) return l("It gets its own channel once 1 more player plays it.");
    return l("It gets its own channel once %d more players play it.", channel.missing);
}

module.exports = {
    buildGameCard,
    gameCardDetailOptions,
    loadGuildInfo,
    duration,
    isMember,
    truncate,
};
