# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ronja.js is a single-guild Discord bot (discord.js v14) for a friend group's gaming community: dynamic voice/text channels, an `/lfg` game-finder, `/top10` game leaderboards, `/news` (a game's Steam news in its text channel), ical event feeds, and server profiles. It is not designed for multi-guild use. Persistence is SQLite via Sequelize.

## Commands

```bash
# Run the bot (reads RONJA_TOKEN from env / .env)
# Slash/context-menu commands are (re-)deployed to Discord automatically on startup.
npm start

# Database migrations (sequelize-cli), on the same database the bot uses (NODE_ENV, see below)
npm run migrate                  # apply all pending migrations
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

`NODE_ENV` selects the Sequelize config block in `config/config.json` (`development` or `production`), which in turn picks the SQLite file path; the bot logs which one on startup. It defaults to `production` when unset, for the bot (`models/index.js`) and for `npm run migrate` alike — `.sequelizerc` sets that default for sequelize-cli, whose own fallback would be `development`. Both also read `.env` first (`index.js` loads it before the models), so a developer on the host can put `NODE_ENV=development` there; a `NODE_ENV` already set in the environment wins over `.env`. Only local dev uses `.data/dev-database.sqlite`: this devcontainer sets `NODE_ENV=development` via `containerEnv` in `.devcontainer/devcontainer.json`, so every process in it gets it. Everything else, including the Docker image and the systemd unit (both set `NODE_ENV=production` explicitly), uses `.data/database.sqlite`. Don't add `omit=dev` to an `.npmrc`: whenever npm's `omit` config includes `dev`, npm forces `NODE_ENV=production` onto every script it runs (`npm start`, `npm run migrate`, `npx`), so the devcontainer would silently use the production-path database. Pass `--omit=dev` to `npm install` where devDependencies aren't wanted instead (the Dockerfile and the systemd install guide do).

## Architecture

### Module system (the core extension point)

Almost all bot behavior lives in `ronja_modules/*.js`, plain objects (not classes) that export a fixed set of optional `hookFor*` methods. `index.js` requires each module, pushes it into a `ronja_modules` array, and on `Events.ClientReady` injects three things onto every module instance:

- `m.client` — the live `Ronja` client instance
- `m.l(...)` — shorthand for `client.myTranslator(...)`
- `m.cfg(name)` — shorthand for `client.myConfigGet(name)`

Discord gateway events in `index.js` are fanned out to _every_ module by checking for the relevant hook and calling it if present:

- `hookForCommandInteraction`, `hookForContextMenuInteraction`, `hookForButtonInteraction`, `hookForSelectMenuInteraction`, `hookForAutocompleteInteraction` — from `Events.InteractionCreate` (also for interactions in DMs, where `interaction.member`/`interaction.guild` are null; autocomplete interactions, sent on every keystroke, aren't logged)
- `hookForVoiceUpdate` — from `Events.VoiceStateUpdate`
- `hookForMessageCreate` — from `Events.MessageCreate` (Guild Messages intent; without the privileged Message Content intent, `message.content` is empty for others' messages)
- `hookForChannelDelete` — from `Events.ChannelDelete`
- `hookForEventUserAdd` / `hookForEventUserRemove` / `hookForEventUserUpdate` — from `Events.GuildScheduledEventUserAdd`/`Remove`
- `hookForEventUpdate` — from `Events.GuildScheduledEventUpdate`
- `hookForEventStart` — from `Events.GuildScheduledEventUpdate` when status transitions into `Active`
- `hookForStartedPlaying` — from `Events.PresenceUpdate`, after `index.js` itself upserts `Game`/`GameStatus` rows for the newly-started activity
- `hookForReady` — once from `Events.ClientReady`, after every module got `client`/`l`/`cfg` and its cron schedules
- `hookForCron` — not a Discord event; returns an array of `{ schedule, action }` pairs registered with `node-cron` at startup, scheduled in the configured timezone

`hookForResolveGame` is the one exception to fan-out-to-every-module: `index.js` calls it on the first module that implements it (in practice just `ronja_modules/IGDB.js`, when IGDB credentials are configured) before the default `Game.findOrCreate`-by-exact-name lookup in the `Events.PresenceUpdate` handler, passing the raw activity name and the guild. It can return `undefined` (not handled, fall back to the default lookup), `null` (gatekeep — don't track this activity as a `Game` at all), or an already-resolved/deduped `Game` instance to use.

`hookForGameDetails(game)` is similar: it's not fanned out from a Discord event, but exposed to other modules via `client.myGameDetails(game)` (`core/Ronja.js`), which calls the first module implementing it (again just `ronja_modules/IGDB.js`, returning its mapped IGDB details incl. `coverUrl`, genres, time to beat, multiplayer modes and links for games with an `igdbId`). It always resolves to a details object or `null` and never throws, so callers can use it purely as optional decoration: `core/gameCard.js` (`buildGameCard`) renders the details as the game card embed that `/gameinfo` replies with (only that short-lived card also gets `loadGuildInfo`'s guild info: the members who played the game in the last 100 days, most recent first, and its text channel's status — the long-lived cards below never show it, as it goes stale), and `DynamicTextChannels` pins in each new game text channel and attaches to its new/re-activated channel notifications. The details also carry the game's `steamAppId` (parsed from its Steam store link), which `/news` (`ronja_modules/SteamNews.js`) uses to show a game text channel's game's latest Steam announcements (only the developer's own `steam_community_announcements` feed) and current Steam player count from Steam's key-less Web API. For games without one (not matched to IGDB, or IGDB unconfigured) it falls back to Steam's store search, accepting only a result named exactly like the game (`normalizeGameName` in `core/gameList.js`, the same rule IGDB's exact matches use). Because of the pinned card, `DynamicTextChannels` decides whether an inactive channel is empty (deleted) or not (archived) by reading its history for messages from anyone but Ronja, not via `channel.lastMessageId`.

`IGDB.js` also runs a background sync (`runSyncPass`, once a day in the admin-configured `igdbSyncHour` setting — a whole hour, 0-23, in the server's timezone, checked hourly via `hookForCron` so changes apply without a restart; unset means no sync at all): it looks up games without an `igdbId` (only exact name matches, including IGDB's alternative names, are merged automatically; anything less certain is DMed to the guild owner as a pick menu, answered via `hookForSelectMenuInteraction`; a game IGDB has no results for at all is tracked as not found and the owner is asked once, with buttons answered via `hookForButtonInteraction`, whether it's a game at all), fills gaps in the per-game IGDB data listed in its `syncFields`, and otherwise refreshes the 1% of matched games checked longest ago. Every IGDB lookup (live and sync) collapses editions (`version_parent`) and DLC/expansions/seasons/updates/ports/mods etc. (`parent_game`, see `COLLAPSED_GAME_TYPES`) onto the base game, while remakes, remasters and sequels stay separate. Its state lives on the `Game` row (`igdbStatus`, `igdbCheckedAt`, `igdbSyncedFields`, and `igdbNotFoundAsked`, kept apart from the status so that no-results question is never asked twice, even after later retries moved the status on). Live lookups (`hookForResolveGame`) follow the same rules as the sync: exact matches are merged, uncertain ones are tracked under their own name and asked about the same way, and games IGDB doesn't know are tracked as not found and asked about once the same way. Whenever a game is renamed or merged, its old name (and the activity name it was matched from) is recorded in the `GameAlias` table; `hookForResolveGame` checks known names (a matched, pending, declined, not-found or ignored game by exact name, or an alias) before asking IGDB — and returns `null` for games the owner marked as "not a game", in a pick menu or the no-results question (their play history is deleted, which removes them from every `GameStatus`-based listing), so those also resolve while IGDB is unreachable or unconfigured. To store a new per-game IGDB field, add its migration/model column and a `syncFields` entry — the sync then fills it in for every matched game, and live lookups store it right away. Stored this way so far: `singlePlayerOnly` and `onlineMaxPlayers`, which `core/gameList.js` uses to leave single-player-only games out of the `/lfg`, voice channel status game lists (and `/lfg`'s pings; the Serverprofile lists them, but marks games both members play with 💬 instead of 🤝 when they're single-player only) and show each game's player limit; games without that data (`null`) are listed as before. Also `genres` (IGDB's genre names as a sorted JSON array), from which the Serverprofile shows a member's top 3 genres over the last 100 days; genre names are translated via `l()` like any other string (also on the game card), so IGDB's English names are the language file keys.

`hookForGameSearch(name, limit)` works the same way via `client.myGameSearch(name, limit)`: the first implementing module (just `IGDB.js`) returns games named like `name` as `[{ igdbId, name, releaseYear }]`; it resolves to `null` if nothing can search right now (IGDB unconfigured, or the search failed) and never throws. `/gameinfo` lives in its own module, `ronja_modules/GameInfo.js`, so it works without IGDB: it searches Ronja's own games (names and `GameAlias`es, without the ones marked "not a game") and adds what `myGameSearch` finds for other games, autocompletes the name from Ronja's games (most recently played first), and shows the card with IGDB details when there are any — or just the name and the guild info. Under the card it puts the buttons every module returns from `hookForGameCardButtons(game, member, locale)` (not fanned out from an event either); `DynamicTextChannels` returns a Join or Leave channel button there for games with an active channel and handles the clicks itself (`hookForButtonInteraction`). Joining creates the same member permission overwrite as being seen playing, but doesn't count as playing; leaving deletes it until Ronja sees the member play again.

Ephemeral replies worth sharing (`/top10`, `/gameinfo`'s card, `/news`, the Serverprofile — not personal settings, admin-only commands or error messages) end with a "Show to channel" button: pass the reply's `components` through `withShareButton(client, locale, rows)` (`core/share.js`), which appends it to the last button row or a row of its own. `ronja_modules/Share.js` handles its clicks: it posts the reply's embeds (not its other buttons) publicly in the channel, naming who shared it (and, for replies older than 10 minutes, when it was created), and deletes the ephemeral reply (Discord can't make an ephemeral message visible after the fact).

`hookForSettingOptions(name, locale)` is likewise not fanned out from an event: `/settings` (`ronja_modules/Settings.js`) calls it on every module to get the choices of a `multiselect` setting (shown as a multi-select menu, stored as a comma-separated list of the picked values) and uses the first non-empty answer. `GameInfo.js` answers it for `gameCardDetails`, which picks the details `core/gameCard.js` shows on the game card.

`/lfg` (`ronja_modules/Zocken.js`) creates a guild scheduled event when given a day or time. Without one it posts a quick session instead: an embed that members join or leave with its buttons (the host and everyone in their voice channel are in from the start; the AFK channel doesn't count as one, and the `lfgQuickSessionRequiresVoice` setting lets admins require hosts to be in one), kept only in memory (a message component collector per session, in `quickSessions`) and deleted without a word after 10 minutes, when its host leaves it or starts a new one, or when its buttons are clicked after a restart.

Modules dispatch on `interaction.commandName` / `customId` themselves (see the pattern in `ronja_modules/Example.js`, which is a documented template — it is excluded from most lint rules and not meant to be treated as production code). Adding a new slash/context-menu command requires **both**: implementing the matching `hookFor*` in a module, and adding a `discord.js` builder instance (`SlashCommandBuilder`/`ContextMenuCommandBuilder`) to that module's `commands` array — deployment then happens automatically (see below).

To register a new module, add it to the `ronja_modules` array in `index.js`.

### `Ronja` client (`core/Ronja.js`)

Extends `discord.js`'s `Client` and adds:

- `myConfig` — an in-memory cache of DB-backed settings, populated from the `Setting` table on ready (`myConfigUpdate`), read via `myConfigGet(name)`/`m.cfg(name)`, written via `myConfigSet(name, value)` (which updates memory and upserts the DB row). Settings are stored and returned as strings; callers that need booleans or numbers must convert.
- `myLanguage` / `myTranslator` (`m.l`) — loads `core/language_<code>.json` files at startup and picks a random phrase for a given `(languageCode, key)` pair. If a key is missing, it is auto-registered with itself as the only phrase and the language file is rewritten to disk — i.e. new strings must go through `l()` early so they get seeded into the language files rather than being called out separately.
- `myFindOrCreate(model, { where, defaults })` — use this instead of Sequelize's `Model.findOrCreate`. That one always opens a transaction, which Sequelize's SQLite dialect runs on a separate connection, and its read lock deadlocks with any concurrent write on the main connection (`SQLITE_BUSY`, even after Sequelize's retries; with long-running writers like the IGDB sync this happens quickly). `myFindOrCreate` looks up and creates on the main connection instead and returns `[instance, created]` the same way.
- `myNotifyOwnerOnPermissionError(guild, err, message)` — when a Discord API call fails because Ronja lacks a permission (Missing Permissions/Missing Access), DMs the guild owner `message` (translated, naming the channel and the permission needed) and returns `true`; for any other error returns `false` so the caller logs it itself. Permission problems always go to the owner this way, never only to the log.
- `myButton(emoji)` — start every button with this instead of `new ButtonBuilder()`: it sets `emoji` in front of the label unless admins turned button emojis off (the `buttonEmojis` setting, default `true`).
- `myDeployCommands(modules)` — called from `myReady` with the full `ronja_modules` array. Collects every module's `commands` array, hashes each command's canonical JSON (sha256 over a recursively key-sorted stringify), and compares against the `Command` table (`name`+`type` as key, storing the Discord-assigned command ID and the hash). Only commands whose hash changed (or that are new/removed) trigger an actual Discord REST call (`POST`/`PATCH`/`DELETE` on individual commands, not a bulk overwrite) — so a normal restart with no command changes makes zero REST calls to Discord's command API.

### Data layer

Sequelize models live in `models/`, auto-loaded by `models/index.js` (every non-index `.js` file in that directory). Config per `NODE_ENV` is in `config/config.json`; migrations live in `migrations/` and are the source of truth for schema _and_ for seeding default `Setting` rows (recent migrations add default values for module-specific settings rather than hardcoding them in module code — see the `default-values-*` migrations). The `Command` table (`models/command.js`) tracks deployed command hashes/IDs for the deploy system above. `GameAlias` (`models/gamealias.js`) holds other names a `Game` is known under, see the IGDB sync above. `VoiceTime` and `ChannelMessages` are per-day counters (day in the configured timezone) that `Top10` fills and ranks for `/top10`'s second and third column: seconds per member in voice channels, only while with at least one other member (not alone or with just bots, not in the AFK channel; every voice update re-checks everyone in the channels involved, and `hookForReady` picks up who's already in voice together; ongoing time is kept in memory and flushed hourly and before each ranking, sessions are split at midnight) and members' messages per game text channel (counted via `hookForMessageCreate`, threads count towards their channel).

### Docker / deployment

`Dockerfile` builds a production image (`npm install --omit=dev`, `NODE_ENV=production`). `docker-compose.yml` runs migrations as a one-shot service before starting the `app` service, sharing a `ronja-data` volume mounted at `/app/.data` — the same relative path the `production` config block already uses, so Docker doesn't need a config block of its own.

### Code style

ESLint (flat config in `eslint.config.mjs`) + Prettier (`.prettierrc.json`: 4-space tabs, double quotes, semicolons, 100-char width) with `eslint-config-prettier` disabling stylistic conflicts. `no-unused-vars` is currently a `warn`, not an `error`; `migrations/**` and `ronja_modules/Example.js` have relaxed/disabled rules — see `TODO.md` for the planned tightening path.

### Reply design

Interaction replies (commands, buttons, menus) and Ronja's posts are always embeds (`EmbedBuilder`), never plain `content` — except text carrying a guild scheduled event URL (`/lfg`), since Discord doesn't render the event's preview inside an embed, and mentions meant to notify someone (`/lfg`'s pings), since mentions inside an embed never notify. Such mentions must be in a direct `interaction.reply()`, neither deferred nor edited in later: Discord doesn't notify mentions in the message that replaces a deferral, nor ones added by an edit. So whatever the reply needs (for `/lfg`, the pings and its event or game list) has to be ready within the 3 seconds Discord waits for it. The embed color says what kind of message it is:

- `Colors.Green` — only to confirm that something was saved or changed (a setting, a permission, a database change).
- `Colors.Red` — errors.
- `Colors.Blue` — everything else: information and results that save nothing (e.g. the `/gameinfo` card, `/top10`, "nothing was changed" answers), questions and in-progress messages.

Ephemeral replies get the "Show to channel" button described above (`withShareButton`), unless they're personal settings, admin-only commands or errors.

Every button has a fitting emoji in front of its label, set via `client.myButton(emoji)` (see above) so the `buttonEmojis` setting can turn them all off. The label must still make sense on its own without the emoji.
