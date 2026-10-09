const { Op, fn, col } = require("sequelize");

// The game lists meant for finding people to play with (/lfg, Serverprofile)
// leave out games IGDB lists as single-player only. Games without IGDB data (singlePlayerOnly null) stay in.
const multiplayerGamesWhere = { singlePlayerOnly: { [Op.not]: true } };

// How many members played a game, in a query on Game that includes its
// GameStatuses. Counts members, not rows, so a duplicate GameStatus row
// can't make one member count twice.
const countDistinctPlayers = fn("COUNT", fn("DISTINCT", col("GameStatuses.member")));

// What such a list shows after a game's name: its online player limit, if
// IGDB knows it (see onlineMaxPlayers in ronja_modules/IGDB.js), with a
// warning if it's lower than `players` - or nothing at all.
function playerLimit(client, locale, maxPlayers, players = 0) {
    if (!maxPlayers) return "";
    let limit = ` · 👥 ${client.myTranslator(locale, "up to %d", maxPlayers)}`;
    return players > maxPlayers ? `${limit} ⚠️` : limit;
}

// Game names compare equal regardless of case, punctuation and spacing, so
// e.g. "Death Stranding Director's Cut" matches "Death Stranding: Director's Cut"
// (and "Valheim™" matches "Valheim").
function normalizeGameName(name) {
    return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

module.exports = { multiplayerGamesWhere, countDistinctPlayers, playerLimit, normalizeGameName };
