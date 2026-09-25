const { Op } = require("sequelize");

// The game lists meant for finding people to play with (/lfg, the voice
// channel status, Serverprofile) leave out games IGDB lists as single-player
// only. Games without IGDB data (singlePlayerOnly null) stay in.
const multiplayerGamesWhere = { singlePlayerOnly: { [Op.not]: true } };

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

module.exports = { multiplayerGamesWhere, playerLimit, normalizeGameName };
