const { games } = require("gamedig");
const { normalizeGameName } = require("./gameList.js");

const GAMES_LIST_URL = "https://github.com/gamedig/node-gamedig/blob/master/GAMES_LIST.md";

// The GameDig protocols that take a password or token, by the options they
// expect it in. `required`: GameDig can't check the server without one.
// Their notes in GAMES_LIST_URL are anchored by the protocol's name.
const PASSWORD_PROTOCOLS = {
    // Palworld's REST API user is always "admin", with the server's admin password.
    palworld: { required: true, options: (password) => ({ username: "admin", password }) },
    terraria: { required: true, options: (token) => ({ token }) },
    farmingsimulator: { required: true, options: (token) => ({ token }) },
    satisfactory: { required: false, options: (token) => ({ token }) },
};

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

// The ids of the game types `text` names: a type's id, a game named like it
// (see gameTypesFor) or, failing those, every game whose name contains it.
function findGameTypes(text) {
    let id = text.trim().toLowerCase();
    if (gameType(id)) return [id];
    let named = gameTypesFor(text);
    if (named.length) return named;
    let normalized = normalizeGameName(text);
    if (!normalized) return [];
    return Object.keys(games).filter((id) =>
        normalizeGameName(games[id].name).includes(normalized)
    );
}

// How a game type is shown, e.g. "Valheim (2021)" - GameDig has several
// types for some games, like Minecraft's editions.
function gameTypeLabel(id) {
    let type = gameType(id);
    if (!type) return id;
    return type.release_year ? `${type.name} (${type.release_year})` : type.name;
}

// How a game type takes a password or token ({ required, options, notesUrl })
// - or null if it doesn't take one.
function passwordProtocol(id) {
    let protocol = gameType(id)?.options?.protocol;
    if (!protocol || !Object.hasOwn(PASSWORD_PROTOCOLS, protocol)) return null;
    return { ...PASSWORD_PROTOCOLS[protocol], notesUrl: `${GAMES_LIST_URL}#${protocol}` };
}

// The GameDig query options for a GameServer row's password, if it has one.
function passwordOptions(server) {
    let protocol = passwordProtocol(server.type);
    return protocol && server.password ? protocol.options(server.password) : {};
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

module.exports = {
    GAMES_LIST_URL,
    gameType,
    gameTypesFor,
    findGameTypes,
    gameTypeLabel,
    passwordProtocol,
    passwordOptions,
    connectAddress,
    statusLine,
};
