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

- `hookForCommandInteraction`, `hookForContextMenuInteraction`, `hookForButtonInteraction` — from `Events.InteractionCreate`
- `hookForVoiceUpdate` — from `Events.VoiceStateUpdate`
- `hookForChannelDelete` — from `Events.ChannelDelete`
- `hookForEventUserAdd` / `hookForEventUserRemove` / `hookForEventUserUpdate` — from `Events.GuildScheduledEventUserAdd`/`Remove`
- `hookForEventUpdate` — from `Events.GuildScheduledEventUpdate`
- `hookForEventStart` — from `Events.GuildScheduledEventUpdate` when status transitions into `Active`
- `hookForStartedPlaying` — from `Events.PresenceUpdate`, after `index.js` itself upserts `Game`/`GameStatus` rows for the newly-started activity
- `hookForCron` — not a Discord event; returns an array of `{ schedule, action }` pairs registered with `node-cron` at startup, scheduled in the configured timezone

Modules dispatch on `interaction.commandName` / `customId` themselves (see the pattern in `ronja_modules/Example.js`, which is a documented template — it is excluded from most lint rules and not meant to be treated as production code). Adding a new slash/context-menu command requires **both**: implementing the matching `hookFor*` in a module, and adding a `discord.js` builder instance (`SlashCommandBuilder`/`ContextMenuCommandBuilder`) to that module's `commands` array — deployment then happens automatically (see below).

To register a new module, add it to the `ronja_modules` array in `index.js`.

### `Ronja` client (`core/Ronja.js`)

Extends `discord.js`'s `Client` and adds:

- `myConfig` — an in-memory cache of DB-backed settings, populated from the `Setting` table on ready (`myConfigUpdate`), read via `myConfigGet(name)`/`m.cfg(name)`, written via `myConfigSet(name, value)` (which updates memory and upserts the DB row). Settings are stored and returned as strings; callers that need booleans or numbers must convert.
- `myLanguage` / `myTranslator` (`m.l`) — loads `core/language_<code>.json` files at startup and picks a random phrase for a given `(languageCode, key)` pair. If a key is missing, it is auto-registered with itself as the only phrase and the language file is rewritten to disk — i.e. new strings must go through `l()` early so they get seeded into the language files rather than being called out separately.
- `myDeployCommands(modules)` — called from `myReady` with the full `ronja_modules` array. Collects every module's `commands` array, hashes each command's canonical JSON (sha256 over a recursively key-sorted stringify), and compares against the `Command` table (`name`+`type` as key, storing the Discord-assigned command ID and the hash). Only commands whose hash changed (or that are new/removed) trigger an actual Discord REST call (`POST`/`PATCH`/`DELETE` on individual commands, not a bulk overwrite) — so a normal restart with no command changes makes zero REST calls to Discord's command API.

### Data layer

Sequelize models live in `models/`, auto-loaded by `models/index.js` (every non-index `.js` file in that directory). Config per `NODE_ENV` is in `config/config.json`; migrations live in `migrations/` and are the source of truth for schema _and_ for seeding default `Setting` rows (recent migrations add default values for module-specific settings rather than hardcoding them in module code — see the `default-values-*` migrations). The `Command` table (`models/command.js`) tracks deployed command hashes/IDs for the deploy system above.

### Docker / deployment

`Dockerfile` builds a production image (`npm install --omit=dev`, `NODE_ENV=production`). `docker-compose.yml` runs migrations as a one-shot service before starting the `app` service, sharing a `ronja-data` volume mounted at `/app/.data` — the same relative path the `production` config block already uses, so Docker doesn't need a config block of its own.

### Code style

ESLint (flat config in `eslint.config.mjs`) + Prettier (`.prettierrc.json`: 4-space tabs, double quotes, semicolons, 100-char width) with `eslint-config-prettier` disabling stylistic conflicts. `no-unused-vars` is currently a `warn`, not an `error`; `migrations/**` and `ronja_modules/Example.js` have relaxed/disabled rules — see `TODO.md` for the planned tightening path.
