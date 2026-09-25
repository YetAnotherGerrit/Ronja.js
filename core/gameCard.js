const { EmbedBuilder, time, TimestampStyles } = require("discord.js");
const { DateTime } = require("luxon");

// Discord allows 6000 characters across all embeds of a message. These caps
// keep a card well below that, so it still fits next to another embed (e.g.
// a new channel notification).
const SUMMARY_MAX_LENGTH = 2000;
const LIST_MAX_LENGTH = 512;
const LINKS_MAX_LENGTH = 1024; // Discord's limit for a field value.

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

function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Builds the card embed for a game's details, as returned by
// client.myGameDetails(game) - without a color, which is up to the caller.
// Everything the details don't have is left out.
function buildGameCard(client, details, locale) {
    let l = (...args) => client.myTranslator(locale, ...args);
    let e = new EmbedBuilder().setTitle(truncate(details.name, 256)).setFooter({ text: "IGDB" });

    if (details.url) e.setURL(details.url);
    if (details.summary) e.setDescription(truncate(details.summary, SUMMARY_MAX_LENGTH));
    if (details.coverUrl) e.setThumbnail(details.coverUrl);

    let fields = [];
    let add = (name, value, inline = true) => {
        if (value) fields.push({ name, value, inline });
    };
    let list = (items) => truncate((items || []).join(", "), LIST_MAX_LENGTH);

    add(l("Release date"), releaseDate(details.releaseDate));
    add(l("Platforms"), list(details.platforms));
    if (details.rating != null) add(l("Rating"), `${Math.round(details.rating)}/100`);
    add(l("Genres"), list(details.genres));
    add(l("Time to beat"), timeToBeatLines(l, details.timeToBeat));

    let multiplayer = multiplayerLines(l, details.multiplayer);
    if (multiplayer) add(l("Multiplayer"), multiplayer);
    else add(l("Game modes"), list(details.gameModes));

    add(l("Links"), links(l, details.websites), false);

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

module.exports = { buildGameCard };
