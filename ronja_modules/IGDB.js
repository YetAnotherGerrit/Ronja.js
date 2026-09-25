const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");
const { Op, TimeoutError, UniqueConstraintError } = require("sequelize");
const { setTimeout: sleep } = require("node:timers/promises");

const IGDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h - IGDB data barely changes day to day.
const IGDB_MIN_REQUEST_INTERVAL_MS = 250; // IGDB allows 4 requests per second.
const TOKEN_REFRESH_SLACK_MS = 60 * 1000;
const GAMEINFO_CANDIDATE_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Background sync (see runSyncPass).
const SYNC_REQUEST_INTERVAL_MS = 2 * 1000; // The sync's own pace, leaving IGDB's budget to live use.
const SYNC_BATCH_SIZE = 10;
const SYNC_MAX_CONSECUTIVE_FAILURES = 3;
const SYNC_REFRESH_SHARE = 0.01; // With one pass a day, every game is re-checked about every 100 days.
const SYNC_NOT_FOUND_RETRY_MS = 30 * DAY_MS;
const SYNC_DECLINED_RETRY_MS = 100 * DAY_MS;
const SYNC_PICK_PREFIX = "igdbSyncPick:";
const SYNC_PICK_NONE = "none";
const SUMMARY_MAX_LENGTH = 2000; // Discord's message limit.

// IGDB fields every game lookup needs, on top of syncFields: alternative names
// for matching, what's needed to collapse editions etc. onto the base game, and
// the release year shown in pick menus.
const IGDB_LOOKUP_FIELDS =
    "name,alternative_names.name,version_parent,parent_game,game_type,first_release_date";
// IGDB game_types that are the same game as their `parent_game` as far as
// Ronja is concerned (https://api-docs.igdb.com/#game-type). Remakes,
// remasters, standalone expansions, bundles and forks stay separate games;
// editions are linked via `version_parent` and always collapse.
const COLLAPSED_GAME_TYPES = [
    1, // DLC
    2, // Expansion
    5, // Mod
    6, // Episode
    7, // Season
    10, // Expanded Game (e.g. Director's Cut, Enhanced Edition)
    11, // Port
    13, // Pack / Addon
    14, // Update
];
const COLLAPSE_MAX_HOPS = 3; // e.g. an edition of an expanded game of the base game

const myIgdb = {
    collectorTimeout: 60 * 1000,

    // gameName -> { result: resolveSearchResults() result, expiresAt }
    igdbCache: new Map(),
    // igdbId -> { result: details | null, expiresAt }
    igdbDetailsCache: new Map(),
    igdbToken: null, // { accessToken, expiresAt }
    igdbNextRequestAt: 0,
    syncRunning: false,
    loggedSyncSchedule: null,
    liveLookups: new Map(), // gameName -> in-flight resolveLiveGame() promise

    // Per-game IGDB data stored on Game rows and kept up to date by the
    // background sync. Each entry names the IGDB `fields` it needs and maps a
    // raw IGDB game onto its Game column (a string, number or null). A new
    // stored field only needs its migration and an entry here: every matched
    // game then gets it filled in gradually, and refreshes keep it current.
    syncFields: [{ column: "name", fields: "name", map: (g) => g.name }],

    commands: [
        new SlashCommandBuilder()
            .setName("gameinfo")
            .setNameLocalizations({ de: "spielinfo" })
            .setDescription("Look up information about a game on IGDB.")
            .setDescriptionLocalizations({
                de: "Zeigt Informationen zu einem Spiel von IGDB.",
            })
            .addStringOption((option) =>
                option
                    .setName("name")
                    .setNameLocalizations({ de: "name" })
                    .setDescription("The name of the game to look up.")
                    .setDescriptionLocalizations({
                        de: "Der Name des gesuchten Spiels.",
                    })
                    .setRequired(true)
            )
            .setDMPermission(false),
    ],

    isConfigured: function () {
        return Boolean(this.cfg("igdbClientId") && this.cfg("igdbClientSecret"));
    },

    getCached: function (key, cache = this.igdbCache) {
        let entry = cache.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt < Date.now()) {
            cache.delete(key);
            return undefined;
        }
        return entry.result;
    },

    setCached: function (key, result, cache = this.igdbCache) {
        cache.set(key, { result, expiresAt: Date.now() + IGDB_CACHE_TTL_MS });
    },

    getIgdbToken: async function () {
        if (this.igdbToken && this.igdbToken.expiresAt > Date.now()) {
            return this.igdbToken.accessToken;
        }

        let params = new URLSearchParams({
            client_id: this.cfg("igdbClientId"),
            client_secret: this.cfg("igdbClientSecret"),
            grant_type: "client_credentials",
        });

        let res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
        if (!res.ok) throw new Error(`Twitch OAuth token request failed: ${res.status}`);
        let data = await res.json();

        this.igdbToken = {
            accessToken: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_REFRESH_SLACK_MS,
        };
        return this.igdbToken.accessToken;
    },

    // Shared throttle for every IGDB request (live lookups, /gameinfo and the
    // background sync), so together they stay within IGDB's rate limit.
    waitForIgdbSlot: async function () {
        let now = Date.now();
        let slot = Math.max(now, this.igdbNextRequestAt);
        this.igdbNextRequestAt = slot + IGDB_MIN_REQUEST_INTERVAL_MS;
        if (slot > now) await sleep(slot - now);
    },

    igdbRequest: async function (body) {
        let token = await this.getIgdbToken();
        await this.waitForIgdbSlot();
        let res = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: {
                "Client-ID": this.cfg("igdbClientId"),
                Authorization: `Bearer ${token}`,
                "Content-Type": "text/plain",
            },
            body,
        });
        if (!res.ok) throw new Error(`IGDB request failed: ${res.status} ${res.statusText}`);
        return await res.json();
    },

    // Runs an IGDB "search" query for `name` and returns the raw results,
    // ranked by IGDB's own relevance scoring - unfiltered, since that ranking
    // doesn't reliably put an exact title match first (e.g. "Slay the Spire"
    // can rank "Slay the Spire II" above the base game), and short/partial
    // queries can rank almost anything first. Good enough to let a human
    // pick from (see presentGameChoices); not good enough to trust blindly.
    igdbSearchTop: async function (name, fields, limit) {
        return await this.igdbRequest(
            `search "${name.replace(/"/g, '\\"')}"; fields ${fields}; limit ${limit};`
        );
    },

    // The IGDB id of the game `raw` should count as instead (an edition's base
    // game, a DLC's main game, ...), or null if `raw` is a game of its own.
    collapsedParentId: function (raw) {
        if (raw.version_parent) return raw.version_parent;
        if (raw.parent_game && COLLAPSED_GAME_TYPES.includes(raw.game_type)) {
            return raw.parent_game;
        }
        return null;
    },

    // Maps each raw IGDB game (fetched with syncFieldList) onto the base game
    // it collapses into, fetching parents in one batched request per hop.
    // Returns an array parallel to `raws`.
    collapseToBase: async function (raws) {
        let bases = raws.slice();
        for (let hop = 0; hop < COLLAPSE_MAX_HOPS; hop++) {
            let parentIds = [...new Set(bases.map((b) => this.collapsedParentId(b)))].filter(
                Boolean
            );
            if (!parentIds.length) break;

            let parents = await this.igdbRequest(
                `fields ${this.syncFieldList()}; where id = (${parentIds.join(",")}); limit ${parentIds.length};`
            );
            let byId = new Map(parents.map((p) => [p.id, p]));
            bases = bases.map((b) => byId.get(this.collapsedParentId(b)) ?? b);
        }
        return bases;
    },

    // Game names compare equal regardless of case, punctuation and spacing, so
    // e.g. "Death Stranding Director's Cut" matches "Death Stranding: Director's Cut".
    normalizeName: function (name) {
        return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    },

    // Collapses search results onto their base games and looks for an exact
    // match on `name`: an official name before an alternative one, and within
    // each, a result that is a game of its own before one that collapses (e.g.
    // an edition's own name) before a base game that only showed up through
    // what collapses into it (e.g. a base game found via its seasons).
    // Returns { exact: base game | null, bases: unique base games, in order }.
    resolveSearchResults: async function (results, name) {
        let bases = await this.collapseToBase(results);
        let wanted = this.normalizeName(name);
        let same = (other) => Boolean(wanted) && this.normalizeName(other) === wanted;
        let finders = [
            (r) => same(r.name),
            (r) => (r.alternative_names || []).some((a) => same(a.name)),
        ];
        let pairs = results.map((raw, i) => ({ candidate: raw, base: bases[i] }));
        let pools = [
            pairs.filter((p) => p.base.id === p.candidate.id),
            pairs.filter((p) => p.base.id !== p.candidate.id),
            bases.map((b) => ({ candidate: b, base: b })),
        ];

        let exact = null;
        for (let find of finders) {
            for (let pool of pools) {
                exact ??= pool.find((p) => find(p.candidate))?.base ?? null;
            }
        }

        let unique = [...new Map(bases.map((b) => [b.id, b])).values()];
        return { exact, bases: unique };
    },

    // The IGDB fields to request for any game lookup: IGDB_LOOKUP_FIELDS plus
    // everything in syncFields.
    syncFieldList: function () {
        let fields = [IGDB_LOOKUP_FIELDS, ...this.syncFields.map((f) => f.fields)]
            .flatMap((f) => f.split(","))
            .map((s) => s.trim());
        return [...new Set(fields)].join(",");
    },

    // Stored in Game.igdbSyncedFields once a row is synced, so changing the
    // synced columns or the IGDB fields they're based on marks every matched
    // game as having gaps to fill (and re-checks it).
    syncSignature: function () {
        let columns = this.syncFields.map((f) => f.column).sort();
        return `${columns.join(",")}|${this.syncFieldList()}`;
    },

    // A raw IGDB game (fetched with at least syncFieldList) as an IGDB match:
    // { id, name, values: { <synced column>: value } }.
    toMatch: function (raw) {
        let values = {};
        for (let f of this.syncFields) values[f.column] = f.map(raw) ?? null;
        return { id: raw.id, name: raw.name, values };
    },

    // The subset of `target` attributes that differ from `game`'s.
    syncChanges: function (game, target) {
        let changes = {};
        for (let [key, value] of Object.entries(target)) {
            if (game[key] !== value) changes[key] = value;
        }
        return changes;
    },

    newSyncReport: function () {
        return {
            matched: [],
            merged: [], // { from: name, to: Game } - `to` may still be renamed afterwards
            updated: [],
            gone: [],
            notFound: [],
            pending: [],
            orphaned: [],
            ownerUnreachable: false,
        };
    },

    releaseYear: function (candidate) {
        return candidate.first_release_date
            ? DateTime.fromSeconds(candidate.first_release_date).toFormat("yyyy")
            : undefined;
    },

    candidateOptions: function (candidates) {
        return candidates.map((c) => ({
            label: c.name.slice(0, 100),
            description: this.releaseYear(c),
            value: String(c.id),
        }));
    },

    mapGameDetails: function (g) {
        return {
            id: g.id,
            name: g.name,
            summary: g.summary || null,
            releaseDate: g.first_release_date
                ? DateTime.fromSeconds(g.first_release_date).toFormat("yyyy-LL-dd")
                : null,
            platforms: (g.platforms || []).map((p) => p.name),
            rating: g.total_rating ?? null,
            coverUrl: g.cover?.image_id
                ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
                : null,
        };
    },

    fetchGameDetailsById: async function (id) {
        let results = await this.igdbRequest(
            `fields name,summary,first_release_date,cover.image_id,platforms.name,total_rating; where id = ${Number(id)}; limit 1;`
        );
        return results[0] ? this.mapGameDetails(results[0]) : null;
    },

    // Moves `source`'s GameStatus history onto `target` and drops `source`.
    // Where both already have a status for the same member, the more recent
    // lastplayed wins. With a sync `report`, the merge and any orphaned
    // channel are collected there instead of DMing the guild owner right away.
    mergeGameInto: async function (source, target, guild, report) {
        let statuses = await this.client.db.GameStatus.findAll({ where: { GameId: source.id } });

        for (let status of statuses) {
            let existing = await this.client.db.GameStatus.findOne({
                where: { GameId: target.id, member: status.member },
            });

            if (existing) {
                if (status.lastplayed > existing.lastplayed) {
                    await existing.update({ lastplayed: status.lastplayed });
                }
                await status.destroy();
            } else {
                await status.update({ GameId: target.id });
            }
        }

        // If `target` has no text channel of its own, it takes over `source`'s.
        // Otherwise `source.channel` has no home on `target` - deleting it
        // automatically is out of scope here, so just leave it as an orphan and
        // let an admin decide.
        if (source.channel && source.channel !== target.channel) {
            if (!target.channel) {
                await target.update({ channel: source.channel });
            } else if (report) {
                report.orphaned.push(`<#${source.channel}>`);
            } else if (guild) {
                this.client.myNotifyOwner(
                    guild,
                    this.l(
                        guild.preferredLocale,
                        'IGDB merged the duplicate game "%s" into "%s", but they had different text channels - %s is now orphaned (no game is linked to it anymore). You may want to archive, delete, or repurpose it manually.',
                        source.name,
                        target.name,
                        `<#${source.channel}>`
                    )
                );
            }
        }

        // Keep `source`'s names findable: its own aliases and its name move to `target`.
        await this.client.db.GameAlias.update(
            { GameId: target.id },
            { where: { GameId: source.id } }
        );
        await source.destroy();
        await this.addAlias(source.name, target);
        report?.merged.push({ from: source.name, to: target });
        console.log(`IGDB: merged duplicate game "${source.name}" into "${target.name}".`);
    },

    // Finds (or creates) the canonical Game row for an IGDB match, adopting
    // and/or merging any pre-existing untagged row(s) for the same game - the
    // self-healing step that lets the table converge onto official names as
    // variant activity names get played again. `match` is an IGDB match (see
    // toMatch), whose synced values are stored on the canonical row as well.
    resolveCanonicalGame: async function (rawName, match, guild, report) {
        let db = this.client.db;
        let igdbId = String(match.id);
        let synced = {
            ...match.values,
            name: match.name,
            igdbId,
            igdbStatus: null,
            igdbSyncedFields: this.syncSignature(),
        };

        let canonical = await db.Game.findOne({ where: { igdbId } });

        let candidateNames = [...new Set([rawName, match.name])];
        let legacyRows = await db.Game.findAll({
            where: { igdbId: null, name: candidateNames },
        });

        if (!canonical) {
            if (legacyRows.length === 0) {
                let created = await db.Game.create({ ...synced, igdbCheckedAt: new Date() });
                await this.addAlias(rawName, created);
                return created;
            }

            // Prefer adopting whichever legacy row already carries the canonical
            // name, so renaming the survivor below can never collide with a
            // second legacy row (e.g. "Slay the Spire 2" and "Slay the Spire
            // II" both pre-existing) that still holds that exact name.
            let canonicalIndex = legacyRows.findIndex((row) => row.name === match.name);
            canonical =
                canonicalIndex >= 0 ? legacyRows.splice(canonicalIndex, 1)[0] : legacyRows.shift();

            // Merge away any other duplicate(s) first, while they still hold
            // their own distinct name, then rename/tag the survivor.
            for (let dupe of legacyRows) {
                await this.mergeGameInto(dupe, canonical, guild, report);
            }
            legacyRows = [];

            let originalName = canonical.name;
            await canonical.update({ ...synced, igdbCheckedAt: new Date() });
            await this.addAlias(originalName, canonical);
            report?.matched.push(
                originalName === match.name ? match.name : `${originalName} → ${match.name}`
            );
        } else {
            // IGDB's data (e.g. its canonical name) can change over time; keep it in sync.
            let changes = this.syncChanges(canonical, synced);
            if (Object.keys(changes).length) {
                let previousName = canonical.name;
                await canonical.update({ ...changes, igdbCheckedAt: new Date() });
                await this.addAlias(previousName, canonical);
            }
        }

        for (let dupe of legacyRows) {
            if (dupe.id === canonical.id) continue;
            await this.mergeGameInto(dupe, canonical, guild, report);
        }

        await this.addAlias(rawName, canonical);
        return canonical;
    },

    // Records `name` as another name of `game`, so a renamed or merged game is
    // still found by its old activity name (see findKnownGame). Skipped for a
    // name some game actually carries - that game always wins anyway.
    addAlias: async function (name, game) {
        let db = this.client.db;
        if (!name || (await db.Game.findOne({ where: { name } }))) return;

        let [alias, created] = await this.client.myFindOrCreate(db.GameAlias, {
            where: { name },
            defaults: { GameId: game.id },
        });
        if (!created && alias.GameId !== game.id) await alias.update({ GameId: game.id });
    },

    // A game Ronja already knows under this exact activity name: one matched to
    // IGDB, one the guild owner kept as it is or hasn't answered the sync's
    // question about yet (so IGDB's top-ranked guess can't override that), or
    // one known by this alias. Returns null for anything else.
    findKnownGame: async function (name) {
        let db = this.client.db;
        let game = await db.Game.findOne({
            where: {
                name,
                [Op.or]: [
                    { igdbId: { [Op.ne]: null } },
                    { igdbStatus: ["declined", "pending", "notFound"] },
                ],
            },
        });
        if (game) return game;

        let alias = await db.GameAlias.findOne({ where: { name }, include: db.Game });
        return alias?.Game ?? null;
    },

    // Resolves an activity name (known names first, then IGDB) and returns:
    // - undefined: not handled here (an unknown name while IGDB is unconfigured,
    //   or a transient IGDB error) - the caller should fall back to its default
    //   behavior.
    // - a Game instance: the row to use. For an exact IGDB match, that's the
    //   canonical, already-created/merged row. Anything less certain is tracked
    //   under its own name and the guild owner is asked about it (see
    //   applyLookup), just like the background sync does.
    hookForResolveGame: async function (gameName, guild) {
        // Several members starting the same new game at once share one lookup,
        // so it gets one row and at most one question to the owner.
        let inFlight = this.liveLookups.get(gameName);
        if (!inFlight) {
            inFlight = this.resolveLiveGame(gameName, guild).finally(() =>
                this.liveLookups.delete(gameName)
            );
            this.liveLookups.set(gameName, inFlight);
        }
        return await inFlight;
    },

    resolveLiveGame: async function (gameName, guild) {
        // Known names need no IGDB request - the background sync keeps their data
        // current - and keep working while IGDB is unreachable or unconfigured.
        let known = await this.findKnownGame(gameName);
        if (known) return known;

        if (!this.isConfigured()) return undefined;

        let resolved = this.getCached(gameName);
        if (resolved === undefined) {
            try {
                let results = await this.igdbSearchTop(gameName, this.syncFieldList(), 10);
                resolved = await this.resolveSearchResults(results, gameName);
            } catch (err) {
                console.error(
                    `IGDB: lookup for "${gameName}" failed, leaving it to default matching for now:`,
                    err
                );
                return undefined;
            }
            this.setCached(gameName, resolved);
        }

        if (resolved.exact) {
            return await this.resolveCanonicalGame(gameName, this.toMatch(resolved.exact), guild);
        }

        let [game] = await this.client.myFindOrCreate(this.client.db.Game, {
            where: { name: gameName },
        });
        await this.applyLookup(game, resolved, guild, this.newSyncReport());
        return game;
    },

    // Returns the mapped IGDB details (see mapGameDetails) for a Game row that
    // has been matched to IGDB, or null if IGDB is unconfigured or the game
    // was never matched. Reached via client.myGameDetails(game) by other
    // modules; a transient IGDB error propagates to (and is logged by) that.
    hookForGameDetails: async function (game) {
        if (!this.isConfigured() || !game.igdbId) return null;

        let details = this.getCached(game.igdbId, this.igdbDetailsCache);
        if (details === undefined) {
            details = await this.fetchGameDetailsById(game.igdbId);
            this.setCached(game.igdbId, details, this.igdbDetailsCache);
        }
        return details;
    },

    hookForCron: function () {
        this.logSyncSchedule();
        return [
            {
                // Checked hourly rather than scheduled once, so a changed
                // igdbSyncHour applies without a restart.
                schedule: "0 * * * *", // https://crontab.guru/
                action: () => {
                    this.logSyncSchedule();
                    if (this.isSyncDue(DateTime.now())) return this.runSyncPass();
                },
            },
        ];
    },

    // The admin-configured igdbSyncHour (0-23), or null if it's unset or invalid.
    parseSyncHour: function () {
        let hour = /^([01]?\d|2[0-3])$/.exec(this.cfg("igdbSyncHour")?.trim() ?? "");
        return hour ? Number(hour[1]) : null;
    },

    // Whether `now` falls into the admin-configured igdbSyncHour (in the
    // server's timezone). No (valid) hour configured means no background sync.
    isSyncDue: function (now) {
        let hour = this.parseSyncHour();
        if (hour === null) return false;
        return now.setZone(this.cfg("timezone") || "system").hour === hour;
    },

    // Logs whether and when the sync will run - once at startup and again on
    // the hourly check whenever that changed - since otherwise nothing shows
    // until a pass runs.
    logSyncSchedule: function () {
        let value = this.cfg("igdbSyncHour")?.trim() || "";
        let zone = this.cfg("timezone") || "system";
        let state = [value, zone, this.isConfigured()].join("|");
        if (state === this.loggedSyncSchedule) return;
        this.loggedSyncSchedule = state;

        let hour = this.parseSyncHour();
        let at = `${String(hour).padStart(2, "0")}:00`;
        if (!value) {
            console.log("IGDB sync: off, no igdbSyncHour set.");
        } else if (hour === null) {
            console.warn(`IGDB sync: off, igdbSyncHour "${value}" isn't an hour from 0 to 23.`);
        } else if (!DateTime.now().setZone(zone).isValid) {
            console.warn(`IGDB sync: off, the timezone setting "${zone}" isn't valid.`);
        } else if (!this.isConfigured()) {
            console.log(`IGDB sync: set for ${at} (${zone}) daily, but IGDB isn't configured.`);
        } else {
            let next = this.nextSyncRun(DateTime.now());
            let wait = next.diff(DateTime.now(), ["hours", "minutes"]);
            console.log(
                `IGDB sync: runs daily at ${at} (${zone}), next run ${next.toFormat("yyyy-LL-dd HH:mm ZZZZ")}, in ${Math.floor(wait.hours)}h ${Math.round(wait.minutes)}m.`
            );
        }
    },

    // The next time the configured igdbSyncHour starts, in the server's
    // timezone - today if it's still ahead, otherwise tomorrow.
    nextSyncRun: function (now) {
        let local = now.setZone(this.cfg("timezone") || "system");
        let next = local.set({ hour: this.parseSyncHour(), minute: 0, second: 0, millisecond: 0 });
        return next <= local ? next.plus({ days: 1 }) : next;
    },

    // One background sync pass: looks up games never matched to IGDB (plus
    // due retries), fills gaps in the synced per-game data, and - only when
    // neither had anything to do - refreshes the matched games checked longest
    // ago. All progress lives on the Game rows themselves, so an interrupted
    // pass is simply picked up again by the next one.
    runSyncPass: async function () {
        if (this.syncRunning) {
            console.log("IGDB sync: skipped, the previous pass is still running.");
            return;
        }
        if (!this.isConfigured()) {
            console.log("IGDB sync: skipped, IGDB isn't configured.");
            return;
        }
        // Ronja is single-guild - this is where merges get reported to.
        let guild = this.client.guilds.cache.first();
        if (!guild) {
            console.warn("IGDB sync: skipped, Ronja isn't in any guild.");
            return;
        }

        console.log("IGDB sync: pass started.");
        this.syncRunning = true;
        let report = this.newSyncReport();
        try {
            try {
                let lookupIds = await this.findLookupsDue();
                let gapIds = await this.findSyncGaps();
                if (lookupIds.length || gapIds.length) {
                    console.log(
                        `IGDB sync: ${lookupIds.length} game(s) to look up, ${gapIds.length} to fill in.`
                    );
                    await this.syncLookups(lookupIds, guild, report);
                    await this.syncMatched(gapIds, guild, report);
                } else {
                    let refreshIds = await this.findRefreshesDue();
                    console.log(
                        `IGDB sync: nothing to do, refreshing ${refreshIds.length} game(s).`
                    );
                    await this.syncMatched(refreshIds, guild, report);
                }
            } catch (err) {
                console.error("IGDB sync: pass failed:", err);
            }
            await this.sendSyncSummary(guild, report);
        } finally {
            this.syncRunning = false;
            console.log("IGDB sync: pass finished.");
        }
    },

    // Unmatched games that were never checked, plus not-found and declined
    // games whose retry is due. Pending games wait for the owner's answer.
    findLookupsDue: async function () {
        let now = Date.now();
        let games = await this.client.db.Game.findAll({
            attributes: ["id"],
            where: {
                igdbId: null,
                [Op.or]: [
                    { igdbStatus: null },
                    {
                        igdbStatus: "notFound",
                        igdbCheckedAt: { [Op.lt]: new Date(now - SYNC_NOT_FOUND_RETRY_MS) },
                    },
                    {
                        igdbStatus: "declined",
                        igdbCheckedAt: { [Op.lt]: new Date(now - SYNC_DECLINED_RETRY_MS) },
                    },
                ],
            },
            order: [["id", "ASC"]],
        });
        return games.map((g) => g.id);
    },

    // Matched games not yet synced with the current list of synced columns.
    findSyncGaps: async function () {
        let games = await this.client.db.Game.findAll({
            attributes: ["id"],
            where: {
                igdbId: { [Op.ne]: null },
                [Op.or]: [
                    { igdbSyncedFields: null },
                    { igdbSyncedFields: { [Op.ne]: this.syncSignature() } },
                ],
            },
            order: [["id", "ASC"]],
        });
        return games.map((g) => g.id);
    },

    // The share of matched games (at least one) that were checked longest ago.
    findRefreshesDue: async function () {
        let where = { igdbId: { [Op.ne]: null } };
        let matched = await this.client.db.Game.count({ where });
        if (!matched) return [];

        let games = await this.client.db.Game.findAll({
            attributes: ["id"],
            where,
            order: [
                ["igdbCheckedAt", "ASC NULLS FIRST"],
                ["id", "ASC"],
            ],
            limit: Math.ceil(matched * SYNC_REFRESH_SHARE),
        });
        return games.map((g) => g.id);
    },

    // Looks up unmatched games one by one. A failed request leaves the game
    // unchecked for a later pass; several in a row end this pass early.
    syncLookups: async function (ids, guild, report) {
        let failures = 0;
        for (let id of ids) {
            // An earlier lookup in this pass may have merged this row away already.
            let game = await this.client.db.Game.findByPk(id);
            if (!game || game.igdbId) continue;

            await sleep(SYNC_REQUEST_INTERVAL_MS);
            let resolved;
            try {
                let results = await this.igdbSearchTop(game.name, this.syncFieldList(), 10);
                resolved = await this.resolveSearchResults(results, game.name);
            } catch (err) {
                console.error(`IGDB sync: lookup for "${game.name}" failed, retrying later:`, err);
                if (++failures >= SYNC_MAX_CONSECUTIVE_FAILURES) {
                    console.error("IGDB sync: IGDB seems unreachable, ending this pass early.");
                    return;
                }
                continue;
            }
            failures = 0;

            try {
                await this.applyLookup(game, resolved, guild, report);
            } catch (err) {
                console.error(`IGDB sync: could not apply the lookup for "${game.name}":`, err);
                // A locked database is temporary - leave the game for a later pass.
                if (err instanceof TimeoutError) continue;
                // Otherwise it's not IGDB's fault (e.g. a name collision while
                // merging), and retrying on every pass wouldn't help - so treat
                // it like a not-found game.
                await game.update({ igdbStatus: "notFound", igdbCheckedAt: new Date() });
            }
        }
    },

    // Only exact matches are merged automatically - anything less certain
    // would silently rename/merge a game's whole history (and, through its
    // alias, every future play of that name), so ask the owner. Used by both
    // the background sync and live lookups.
    applyLookup: async function (game, { exact, bases }, guild, report) {
        if (exact) {
            await this.resolveCanonicalGame(game.name, this.toMatch(exact), guild, report);
        } else if (bases.length) {
            await this.askOwnerToPick(
                game,
                bases.slice(0, GAMEINFO_CANDIDATE_LIMIT),
                guild,
                report
            );
        } else {
            if (game.igdbStatus !== "notFound") report.notFound.push(game.name);
            await game.update({ igdbStatus: "notFound", igdbCheckedAt: new Date() });
        }
    },

    // DMs the guild owner a pick menu for an uncertain game. The game's id is
    // encoded in the customId, so the answer is handled statelessly by
    // hookForSelectMenuInteraction, even after a restart.
    askOwnerToPick: async function (game, candidates, guild, report) {
        if (report.ownerUnreachable) return;
        let locale = guild.preferredLocale;

        let menu = new StringSelectMenuBuilder()
            .setCustomId(`${SYNC_PICK_PREFIX}${game.id}`)
            .setPlaceholder(this.l(locale, "Choose a game..."))
            .addOptions([
                ...this.candidateOptions(candidates),
                { label: this.l(locale, "None of these, keep as is"), value: SYNC_PICK_NONE },
            ]);

        try {
            let owner = await guild.fetchOwner();
            await owner.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setDescription(
                            this.l(
                                locale,
                                'I found "%s" in the game history, but IGDB has no game with exactly that name. Which game is it?',
                                game.name
                            )
                        ),
                ],
                components: [new ActionRowBuilder().addComponents(menu)],
            });
        } catch (err) {
            // Leave the game unchecked, so it's asked about again on a later pass.
            console.error("IGDB: could not DM the guild owner:", err);
            report.ownerUnreachable = true;
            return;
        }

        await game.update({ igdbStatus: "pending", igdbCheckedAt: new Date() });
        report.pending.push(game.name);
    },

    // Re-fetches matched games from IGDB in batches and stores what changed.
    syncMatched: async function (ids, guild, report) {
        let failures = 0;
        for (let i = 0; i < ids.length; i += SYNC_BATCH_SIZE) {
            let games = await this.client.db.Game.findAll({
                where: { id: ids.slice(i, i + SYNC_BATCH_SIZE), igdbId: { [Op.ne]: null } },
            });
            if (!games.length) continue;

            await sleep(SYNC_REQUEST_INTERVAL_MS);
            let results, bases;
            try {
                results = await this.igdbRequest(
                    `fields ${this.syncFieldList()}; where id = (${games.map((g) => Number(g.igdbId)).join(",")}); limit ${games.length};`
                );
                bases = await this.collapseToBase(results);
            } catch (err) {
                console.error("IGDB sync: refreshing games failed, retrying later:", err);
                if (++failures >= SYNC_MAX_CONSECUTIVE_FAILURES) {
                    console.error("IGDB sync: IGDB seems unreachable, ending this pass early.");
                    return;
                }
                continue;
            }
            failures = 0;

            let byId = new Map(results.map((r, i) => [String(r.id), { raw: r, base: bases[i] }]));
            for (let game of games) {
                let { raw, base } = byId.get(game.igdbId) ?? {};
                try {
                    await this.applySync(game, raw, base, guild, report);
                } catch (err) {
                    console.error(`IGDB sync: could not update "${game.name}":`, err);
                }
            }
        }
    },

    applySync: async function (game, raw, base, guild, report) {
        let checked = { igdbCheckedAt: new Date(), igdbSyncedFields: this.syncSignature() };

        if (!raw) {
            // Removed (or merged away) on IGDB's side - keep everything as it
            // is, but tell the owner once.
            if (game.igdbStatus !== "gone") report.gone.push(game.name);
            await game.update({ ...checked, igdbStatus: "gone" });
            return;
        }

        if (base.id !== raw.id) {
            // Matched to an edition, DLC etc. (e.g. by a live lookup before those
            // were collapsed) - move it onto the base game instead. Unmatching it
            // first lets resolveCanonicalGame adopt or merge it like a legacy row;
            // should that fail midway, the next pass just looks it up again.
            await game.update({ igdbId: null, igdbStatus: null });
            await this.resolveCanonicalGame(game.name, this.toMatch(base), guild, report);
            return;
        }

        let changes = this.syncChanges(game, { ...this.toMatch(raw).values, igdbStatus: null });
        let previousName = game.name;
        try {
            await game.update({ ...changes, ...checked });
        } catch (err) {
            if (!(err instanceof UniqueConstraintError)) throw err;
            console.warn(
                `IGDB sync: not renaming "${previousName}" to "${changes.name}", another game already has that name.`
            );
            // Not via game.update(): the instance still holds the failed changes.
            await this.client.db.Game.update(checked, { where: { id: game.id } });
            return;
        }

        if (changes.name) await this.addAlias(previousName, game);
        if (Object.keys(changes).some((key) => key !== "igdbStatus")) {
            report.updated.push(game.name);
        }
    },

    // One DM to the guild owner per pass that changed something. Lists are
    // shortened until the message fits into a single Discord message.
    sendSyncSummary: async function (guild, report) {
        let locale = guild.preferredLocale;
        let sections = [
            [this.l(locale, "Matched to IGDB"), report.matched],
            [
                this.l(locale, "Merged duplicates"),
                report.merged.map((m) => `${m.from} → ${m.to.name}`),
            ],
            [this.l(locale, "Updated from IGDB"), report.updated],
            [this.l(locale, "No longer on IGDB, please check"), report.gone],
            [this.l(locale, "Not found on IGDB"), report.notFound],
            [this.l(locale, "Waiting for your answer"), report.pending],
            [
                this.l(
                    locale,
                    "Orphaned text channels (no game is linked to them anymore, you may want to archive, delete, or repurpose them manually)"
                ),
                report.orphaned,
            ],
        ].filter(([, items]) => items.length);
        if (!sections.length) return;

        let format = (maxItems) =>
            [
                this.l(locale, "The IGDB sync is done, here's what changed:"),
                ...sections.map(([label, items]) => {
                    let line = `**${label}** (${items.length})`;
                    if (!maxItems) return line;
                    line += `: ${items.slice(0, maxItems).join(", ")}`;
                    if (items.length > maxItems) {
                        line += ` ${this.l(locale, "...and %d more", items.length - maxItems)}`;
                    }
                    return line;
                }),
            ].join("\n");

        let message = [10, 5, 1, 0].map(format).find((m) => m.length <= SUMMARY_MAX_LENGTH);
        await this.client.myNotifyOwner(guild, message ?? format(0).slice(0, SUMMARY_MAX_LENGTH));
    },

    // The guild owner's answer to an askOwnerToPick question.
    hookForSelectMenuInteraction: async function (interaction) {
        if (!interaction.customId.startsWith(SYNC_PICK_PREFIX)) return;
        let guild = this.client.guilds.cache.first();
        if (!guild || interaction.user.id !== guild.ownerId) return;
        let locale = guild.preferredLocale;

        await interaction.deferUpdate();

        // Errors keep the menu, so the owner can simply try again.
        let reply = async (color, message, keepMenu = false) => {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(color).setDescription(message)],
                ...(keepMenu ? {} : { components: [] }),
            });
        };

        let gameId = Number(interaction.customId.slice(SYNC_PICK_PREFIX.length));
        let game = await this.client.db.Game.findByPk(gameId);
        if (!game || game.igdbId || game.igdbStatus !== "pending") {
            await reply(
                Colors.Blue,
                this.l(
                    locale,
                    "This question is outdated: the game has been matched or merged in the meantime, so nothing was changed."
                )
            );
            return;
        }

        let choice = interaction.values[0];
        if (choice === SYNC_PICK_NONE) {
            await game.update({ igdbStatus: "declined", igdbCheckedAt: new Date() });
            await reply(
                Colors.Green,
                this.l(locale, 'Okay, "%s" stays as it is. I\'ll ask again in 100 days.', game.name)
            );
            return;
        }

        let raw;
        try {
            [raw] = await this.igdbRequest(
                `fields ${this.syncFieldList()}; where id = ${Number(choice)}; limit 1;`
            );
            if (raw) [raw] = await this.collapseToBase([raw]);
        } catch (err) {
            console.error("IGDB sync: fetching the owner's pick failed:", err);
            await reply(
                Colors.Red,
                this.l(locale, "Could not reach IGDB right now, please try again later."),
                true
            );
            return;
        }
        if (!raw) {
            await reply(
                Colors.Red,
                this.l(locale, "That game is no longer available on IGDB."),
                true
            );
            return;
        }

        let report = this.newSyncReport();
        let canonical = await this.resolveCanonicalGame(
            game.name,
            this.toMatch(raw),
            guild,
            report
        );
        let message = this.l(locale, 'Matched "%s" to "%s" on IGDB.', game.name, canonical.name);
        if (report.orphaned.length) {
            message += `\n\n**${this.l(
                locale,
                "Orphaned text channels (no game is linked to them anymore, you may want to archive, delete, or repurpose them manually)"
            )}**: ${report.orphaned.join(", ")}`;
        }
        await reply(Colors.Green, message);
    },

    buildGameInfoEmbed: function (details, locale) {
        let e = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(details.name)
            .setFooter({ text: "IGDB" });

        if (details.summary) e.setDescription(details.summary.slice(0, 4096));
        if (details.coverUrl) e.setThumbnail(details.coverUrl);

        let fields = [];
        if (details.releaseDate) {
            fields.push({
                name: this.l(locale, "Release date"),
                value: details.releaseDate,
                inline: true,
            });
        }
        if (details.platforms.length) {
            fields.push({
                name: this.l(locale, "Platforms"),
                value: details.platforms.join(", "),
                inline: true,
            });
        }
        if (details.rating !== null) {
            fields.push({
                name: this.l(locale, "Rating"),
                value: `${Math.round(details.rating)}/100`,
                inline: true,
            });
        }
        if (fields.length) e.addFields(fields);

        return e;
    },

    replyError: async function (interaction, message) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(message)],
            components: [],
        });
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "gameinfo") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!this.isConfigured()) {
            await this.replyError(
                interaction,
                this.l(interaction.locale, "IGDB is not configured on this server.")
            );
            return;
        }

        let name = interaction.options.getString("name");
        let candidates;
        try {
            candidates = await this.igdbSearchTop(
                name,
                "name,first_release_date",
                GAMEINFO_CANDIDATE_LIMIT
            );
        } catch (err) {
            console.error("IGDB: /gameinfo search failed:", err);
            await this.replyError(
                interaction,
                this.l(
                    interaction.locale,
                    "Could not reach IGDB right now, please try again later."
                )
            );
            return;
        }

        if (!candidates.length) {
            await this.replyError(
                interaction,
                this.l(interaction.locale, 'No game found on IGDB for "%s".', name)
            );
            return;
        }

        // Only one candidate at all - nothing to disambiguate, skip the picker.
        if (candidates.length === 1) {
            await this.showGameDetails(interaction, candidates[0].id);
            return;
        }

        await this.presentGameChoices(interaction, candidates);
    },

    // Fetches and shows the detail embed for a single IGDB id, replacing
    // whatever the (ephemeral) reply currently shows.
    showGameDetails: async function (interaction, id) {
        let details;
        try {
            details = await this.fetchGameDetailsById(id);
        } catch (err) {
            console.error("IGDB: /gameinfo detail lookup failed:", err);
            await this.replyError(
                interaction,
                this.l(
                    interaction.locale,
                    "Could not reach IGDB right now, please try again later."
                )
            );
            return;
        }

        if (!details) {
            await this.replyError(
                interaction,
                this.l(interaction.locale, "That game is no longer available on IGDB.")
            );
            return;
        }

        await interaction.editReply({
            embeds: [this.buildGameInfoEmbed(details, interaction.locale)],
            components: [],
        });
    },

    // Shows the (ephemeral, invoker-only) candidate list and swaps in the
    // detail embed once the invoking user picks one.
    presentGameChoices: async function (interaction, candidates) {
        let options = this.candidateOptions(candidates);

        let menu = new StringSelectMenuBuilder()
            .setCustomId("gameinfoPick")
            .setPlaceholder(this.l(interaction.locale, "Choose a game..."))
            .addOptions(options);

        let message = await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setDescription(
                        this.l(
                            interaction.locale,
                            "Multiple games matched - which one did you mean?"
                        )
                    ),
            ],
            components: [new ActionRowBuilder().addComponents(menu)],
        });

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: this.collectorTimeout,
            max: 1,
        });

        collector.on("collect", async (i) => {
            try {
                await i.deferUpdate();
                await this.showGameDetails(interaction, i.values[0]);
            } catch (err) {
                console.error("IGDB: /gameinfo selection failed:", err);
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size > 0) return;
            try {
                await interaction.editReply({ components: [] });
            } catch {
                // The ephemeral message may already be gone.
            }
        });
    },
};

module.exports = myIgdb;
