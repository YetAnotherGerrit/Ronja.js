const { games } = require("gamedig");
const { normalizeGameName } = require("./gameList.js");

// GameDig's game type `id` ({ name, release_year, options: { port } }) - or
// null if GameDig doesn't know it.
function gameType(id) {
    return Object.hasOwn(games, id) ? games[id] : null;
}

// The ids of GameDig's game types named like `name` - the same rule as
// IGDB's exact matches (see normalizeGameName).
function gameTypesFor(name) {
    let normalized = normalizeGameName(name);
    return Object.keys(games).filter((id) => normalizeGameName(games[id].name) === normalized);
}

// How a game type is shown, e.g. "Valheim (2021)" - GameDig has several
// types for some games, like Minecraft's editions.
function gameTypeLabel(id) {
    let type = gameType(id);
    if (!type) return id;
    return type.release_year ? `${type.name} (${type.release_year})` : type.name;
}

// The address members connect to: the one the admin set for that, or the
// one Ronja checks.
function connectAddress(server) {
    return server.connectAddress || `${server.host}:${server.port}`;
}

// A GameServer row's last known status, e.g. "🟢 Online · 3/10 players".
function statusLine(l, server) {
    if (server.online === true) {
        let players = server.maxPlayers
            ? l("%d/%d players", server.players ?? 0, server.maxPlayers)
            : l("%d players", server.players ?? 0);
        return `🟢 ${l("Online")} · ${players}`;
    }
    if (server.online === false) return `🔴 ${l("Offline")}`;
    return `⚪ ${l("Status unknown")}`;
}

module.exports = { gameType, gameTypesFor, gameTypeLabel, connectAddress, statusLine };
