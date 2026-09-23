const { SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");
const { DateTime } = require("luxon");

const IGDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h - IGDB data barely changes day to day.
const TOKEN_REFRESH_SLACK_MS = 60 * 1000;

const myIgdb = {
    // gameName -> { result: {id, name} | null, expiresAt }
    igdbCache: new Map(),
    igdbToken: null, // { accessToken, expiresAt }

    commands: [
        new SlashCommandBuilder()
            .setName("gameinfo")
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

    getCached: function (name) {
        let entry = this.igdbCache.get(name);
        if (!entry) return undefined;
        if (entry.expiresAt < Date.now()) {
            this.igdbCache.delete(name);
            return undefined;
        }
        return entry.result;
    },

    setCached: function (name, result) {
        this.igdbCache.set(name, { result, expiresAt: Date.now() + IGDB_CACHE_TTL_MS });
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

    // IGDB's own relevance ranking doesn't guarantee an exact title match
    // beats e.g. a numbered sequel (searching "Slay the Spire" can rank
    // "Slay the Spire II" first) - prefer an exact (case-insensitive) name
    // match among the candidates before falling back to IGDB's top result.
    pickBestMatch: function (results, name) {
        if (!results.length) return null;
        let exact = results.find((r) => r.name.toLowerCase() === name.toLowerCase());
        return exact || results[0];
    },

    // Runs an IGDB "search" query for `name`, returning the best match (with
    // the requested `fields`) or null if IGDB has nothing.
    igdbSearch: async function (name, fields) {
        let token = await this.getIgdbToken();
        let res = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: {
                "Client-ID": this.cfg("igdbClientId"),
                Authorization: `Bearer ${token}`,
                "Content-Type": "text/plain",
            },
            body: `search "${name.replace(/"/g, '\\"')}"; fields ${fields}; limit 10;`,
        });
        if (!res.ok) throw new Error(`IGDB search failed: ${res.status} ${res.statusText}`);
        let results = await res.json();
        return this.pickBestMatch(results, name);
    },

    fetchGameDetails: async function (name) {
        let g = await this.igdbSearch(
            name,
            "name,summary,first_release_date,cover.image_id,platforms.name,total_rating"
        );
        if (!g) return null;

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

    // Moves `source`'s GameStatus history onto `target` and drops `source`.
    // Where both already have a status for the same member, the more recent
    // lastplayed wins.
    mergeGameInto: async function (source, target) {
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

        await source.destroy();
        console.log(`IGDB: merged duplicate game "${source.name}" into "${target.name}".`);
    },

    // Finds (or creates) the canonical Game row for an IGDB match, adopting
    // and/or merging any pre-existing untagged row(s) for the same game - the
    // self-healing step that lets the table converge onto official names as
    // variant activity names get played again.
    resolveCanonicalGame: async function (rawName, match) {
        let db = this.client.db;
        let igdbId = String(match.id);

        let canonical = await db.Game.findOne({ where: { igdbId } });

        let candidateNames = [...new Set([rawName, match.name])];
        let legacyRows = await db.Game.findAll({
            where: { igdbId: null, name: candidateNames },
        });

        if (!canonical) {
            if (legacyRows.length === 0) {
                return await db.Game.create({ name: match.name, igdbId });
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
                await this.mergeGameInto(dupe, canonical);
            }
            legacyRows = [];

            if (canonical.name !== match.name || canonical.igdbId !== igdbId) {
                await canonical.update({ name: match.name, igdbId });
            }
        } else if (canonical.name !== match.name) {
            // IGDB's canonical name can change over time; keep it in sync.
            await canonical.update({ name: match.name });
        }

        for (let dupe of legacyRows) {
            if (dupe.id === canonical.id) continue;
            await this.mergeGameInto(dupe, canonical);
        }

        return canonical;
    },

    // Resolves an activity name against IGDB and returns:
    // - undefined: not handled here (IGDB unconfigured, or a transient IGDB
    //   error) - the caller should fall back to its default behavior.
    // - null: IGDB has no such game - gatekept, do not track.
    // - a Game instance: the canonical, already-created/merged row to use.
    hookForResolveGame: async function (gameName) {
        if (!this.isConfigured()) return undefined;

        let match = this.getCached(gameName);
        if (match === undefined) {
            try {
                let raw = await this.igdbSearch(gameName, "name");
                match = raw ? { id: raw.id, name: raw.name } : null;
            } catch (err) {
                console.error(
                    `IGDB: lookup for "${gameName}" failed, leaving it to default matching for now:`,
                    err
                );
                return undefined;
            }
            this.setCached(gameName, match);
        }

        if (!match) return null;
        return await this.resolveCanonicalGame(gameName, match);
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

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "gameinfo") return;

        await interaction.deferReply();

        if (!this.isConfigured()) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(interaction.locale, "IGDB is not configured on this server.")
                        ),
                ],
            });
            return;
        }

        let name = interaction.options.getString("name");
        let details;
        try {
            details = await this.fetchGameDetails(name);
        } catch (err) {
            console.error("IGDB: /gameinfo lookup failed:", err);
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(
                                interaction.locale,
                                "Could not reach IGDB right now, please try again later."
                            )
                        ),
                ],
            });
            return;
        }

        if (!details) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(interaction.locale, 'No game found on IGDB for "%s".', name)
                        ),
                ],
            });
            return;
        }

        await interaction.editReply({
            embeds: [this.buildGameInfoEmbed(details, interaction.locale)],
        });
    },
};

module.exports = myIgdb;
