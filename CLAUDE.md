# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ronja.js is a single-guild Discord bot (discord.js v14) for a friend group's gaming community: dynamic voice/text channels, an `/lfg` game-finder, `/top10` game leaderboards, ical event feeds, and server profiles. It is not designed for multi-guild use. Persistence is SQLite via Sequelize.

## Commands

```bash
# Run the bot (reads RONJA_TOKEN from env / .env)
# Slash/context-menu commands are (re-)deployed to Discord automatically on startup.
npm start

# Database migrations (sequelize-cli)
npm run migrate                  # what admins and docker-compose run: --env production, always
npm run dev:migrate              # local dev: NODE_ENV-driven, apply all pending migrations
npm run dev:migrate:new <name>   # scaffold a new migration file under migrations/

# One-time import of a pre-2.0 (pre-migrations) database, see migrate-legacy-database.js
npm run migrate-legacy -- /path/to/old/database.sqlite

# Lint / format
npm run dev:lint
npm run dev:lint:fix
npm run dev:format
npm run dev:format:check
```

There is no test suite in this repo currently.

`NODE_ENV` selects the Sequelize config block in `config/config.json` (`development` or `production`), which in turn picks the SQLite file path. It defaults to `production` when unset — only local dev (this devcontainer sets `NODE_ENV=development` via `.devcontainer/devcontainer.json`) uses `.data/dev-database.sqlite`; everything else, including the Docker image, uses `.data/database.sqlite`. `npm run migrate` (`sequelize-cli db:migrate --env production`) is what admins and `docker-compose.yml` both run; `npm run dev:migrate` is the `NODE_ENV`-driven variant for local development.

## Architecture

### Module system (the core extension point)

Almost all bot behavior lives in `ronja_modules/*.js`, plain objects (not classes) that export a fixed set of optional `hookFor*` methods. `index.js` requires each module, pushes it into a `ronja_modules` array, and on `Events.ClientReady` injects three things onto every module instance:

- `m.client` — the live `Ronja` client instance
- `m.l(...)` — shorthand for `client.myTranslator(...)`
- `m.cfg(name)` — shorthand for `client.myConfigGet(name)`

Discord gateway events in `index.js` are fanned out to _every_ module by checking for the relevant hook and calling it if present:

- `hookForCommandInteraction`, `hookForContextMenuInteraction`, `hookForButtonInteraction`, `hookForSelectMenuInteraction` — from `Events.InteractionCreate` (also for interactions in DMs, where `interaction.member`/`interaction.guild` are null)
- `hookForVoiceUpdate` — from `Events.VoiceStateUpdate`
- `hookForChannelDelete` — from `Events.ChannelDelete`
- `hookForEventUserAdd` / `hookForEventUserRemove` / `hookForEventUserUpdate` — from `Events.GuildScheduledEventUserAdd`/`Remove`
- `hookForEventUpdate` — from `Events.GuildScheduledEventUpdate`
- `hookForEventStart` — from `Events.GuildScheduledEventUpdate` when status transitions into `Active`
- `hookForStartedPlaying` — from `Events.PresenceUpdate`, after `index.js` itself upserts `Game`/`GameStatus` rows for the newly-started activity
- `hookForCron` — not a Discord event; returns an array of `{ schedule, action }` pairs registered with `node-cron` at startup, scheduled in the configured timezone

`hookForResolveGame` is the one exception to fan-out-to-every-module: `index.js` calls it on the first module that implements it (in practice just `ronja_modules/IGDB.js`, when IGDB credentials are configured) before the default `Game.findOrCreate`-by-exact-name lookup in the `Events.PresenceUpdate` handler, passing the raw activity name and the guild. It can return `undefined` (not handled, fall back to the default lookup), `null` (gatekeep — don't track this activity as a `Game` at all), or an already-resolved/deduped `Game` instance to use.

`hookForGameDetails(game)` is similar: it's not fanned out from a Discord event, but exposed to other modules via `client.myGameDetails(game)` (`core/Ronja.js`), which calls the first module implementing it (again just `ronja_modules/IGDB.js`, returning its mapped IGDB details incl. `coverUrl`, genres, time to beat, multiplayer modes and links for games with an `igdbId`). It always resolves to a details object or `null` and never throws, so callers can use it purely as optional decoration: `core/gameCard.js` (`buildGameCard`) renders the details as the game card embed that `/gameinfo` replies with, `DynamicTextChannels` pins in each new game text channel and attaches to its new/re-activated channel notifications, and `Top10` uses the #1 game's cover. Because of the pinned card, `DynamicTextChannels` decides whether an inactive channel is empty (deleted) or not (archived) by reading its history for messages from anyone but Ronja, not via `channel.lastMessageId`.

`IGDB.js` also runs a background sync (`runSyncPass`, once a day in the admin-configured `igdbSyncHour` setting — a whole hour, 0-23, in the server's timezone, checked hourly via `hookForCron` so changes apply without a restart; unset means no sync at all): it looks up games without an `igdbId` (only exact name matches, including IGDB's alternative names, are merged automatically; anything less certain is DMed to the guild owner as a pick menu, answered via `hookForSelectMenuInteraction`), fills gaps in the per-game IGDB data listed in its `syncFields`, and otherwise refreshes the 1% of matched games checked longest ago. Every IGDB lookup (live and sync) collapses editions (`version_parent`) and DLC/expansions/seasons/updates/ports/mods etc. (`parent_game`, see `COLLAPSED_GAME_TYPES`) onto the base game, while remakes, remasters and sequels stay separate. Its state lives on the `Game` row (`igdbStatus`, `igdbCheckedAt`, `igdbSyncedFields`). Live lookups (`hookForResolveGame`) follow the same rules as the sync: exact matches are merged, uncertain ones are tracked under their own name and asked about the same way, and games IGDB doesn't know are tracked as not found. Whenever a game is renamed or merged, its old name (and the activity name it was matched from) is recorded in the `GameAlias` table; `hookForResolveGame` checks known names (a matched, pending, declined, not-found or ignored game by exact name, or an alias) before asking IGDB — and returns `null` for games the owner marked as "not a game" in a pick menu (their play history is deleted, which removes them from every `GameStatus`-based listing), so those also resolve while IGDB is unreachable or unconfigured. To store a new per-game IGDB field, add its migration/model column and a `syncFields` entry — the sync then fills it in for every matched game, and live lookups store it right away.

Modules dispatch on `interaction.commandName` / `customId` themselves (see the pattern in `ronja_modules/Example.js`, which is a documented template — it is excluded from most lint rules and not meant to be treated as production code). Adding a new slash/context-menu command requires **both**: implementing the matching `hookFor*` in a module, and adding a `discord.js` builder instance (`SlashCommandBuilder`/`ContextMenuCommandBuilder`) to that module's `commands` array — deployment then happens automatically (see below).

To register a new module, add it to the `ronja_modules` array in `index.js`.

### `Ronja` client (`core/Ronja.js`)

Extends `discord.js`'s `Client` and adds:

- `myConfig` — an in-memory cache of DB-backed settings, populated from the `Setting` table on ready (`myConfigUpdate`), read via `myConfigGet(name)`/`m.cfg(name)`, written via `myConfigSet(name, value)` (which updates memory and upserts the DB row). Settings are stored and returned as strings; callers that need booleans or numbers must convert.
- `myLanguage` / `myTranslator` (`m.l`) — loads `core/language_<code>.json` files at startup and picks a random phrase for a given `(languageCode, key)` pair. If a key is missing, it is auto-registered with itself as the only phrase and the language file is rewritten to disk — i.e. new strings must go through `l()` early so they get seeded into the language files rather than being called out separately.
- `myFindOrCreate(model, { where, defaults })` — use this instead of Sequelize's `Model.findOrCreate`. That one always opens a transaction, which Sequelize's SQLite dialect runs on a separate connection, and its read lock deadlocks with any concurrent write on the main connection (`SQLITE_BUSY`, even after Sequelize's retries; with long-running writers like the IGDB sync this happens quickly). `myFindOrCreate` looks up and creates on the main connection instead and returns `[instance, created]` the same way.
- `myDeployCommands(modules)` — called from `myReady` with the full `ronja_modules` array. Collects every module's `commands` array, hashes each command's canonical JSON (sha256 over a recursively key-sorted stringify), and compares against the `Command` table (`name`+`type` as key, storing the Discord-assigned command ID and the hash). Only commands whose hash changed (or that are new/removed) trigger an actual Discord REST call (`POST`/`PATCH`/`DELETE` on individual commands, not a bulk overwrite) — so a normal restart with no command changes makes zero REST calls to Discord's command API.

### Data layer

Sequelize models live in `models/`, auto-loaded by `models/index.js` (every non-index `.js` file in that directory). Config per `NODE_ENV` is in `config/config.json`; migrations live in `migrations/` and are the source of truth for schema _and_ for seeding default `Setting` rows (recent migrations add default values for module-specific settings rather than hardcoding them in module code — see the `default-values-*` migrations). The `Command` table (`models/command.js`) tracks deployed command hashes/IDs for the deploy system above. `GameAlias` (`models/gamealias.js`) holds other names a `Game` is known under, see the IGDB sync above.

### Docker / deployment

`Dockerfile` builds a production image (`npm install --omit=dev`, `NODE_ENV=production`). `docker-compose.yml` runs migrations as a one-shot service before starting the `app` service, sharing a `ronja-data` volume mounted at `/app/.data` — the same relative path the `production` config block already uses, so Docker doesn't need a config block of its own.

### Code style

ESLint (flat config in `eslint.config.mjs`) + Prettier (`.prettierrc.json`: 4-space tabs, double quotes, semicolons, 100-char width) with `eslint-config-prettier` disabling stylistic conflicts. `no-unused-vars` is currently a `warn`, not an `error`; `migrations/**` and `ronja_modules/Example.js` have relaxed/disabled rules — see `TODO.md` for the planned tightening path.
