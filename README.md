# Ronja.js

A bot for discord guilds that provide a multi gaming community for a circle of
friends. Initial intent was to provide support for the situation when you want
to play with your friends and need to decide on what game to play.

## Features

- Dynamicly created voice channels
    - Let the members create temporary channels as needed.
    - Rename voice channels based on the dominant game that is played by
      the voice channel's members.
- Dynamicly created text channels
    - Channels for specific games are created when a specific amount of
      members on the guild are owning the same game.
    - Automatic archiving of channels about games that are not played anymore.
- /lfg command to find members to game with by assisting on what common
  games you have.
- /top10 command to show the most popular games in the guild.
    - Also weekly, monthly and yearly top 10.
- /ical command to get an ical-feed for the events you attend.
- Serverprofile command to show common games for a specific member.

### Not-Features

- Ronja.js is not (yet?) build to run on more than one guild server.
- This is not a bot that you can simply invite to your guild. You will need
  to host Ronja yourself. But it doesn't require a lot of resources. It should
  run on a Raspberry Pi or any other small host.

## Setup

### Prepare your guild server

1. Create a category for dynamicly created text channels.
   ID needs to be added to config later.

2. Create an archive category for dynamicly created text channels.
   ID needs to be added to config later.

3. Create a "new channel"-voice channel in **some category** with a user limit
   of 1. A new voice channel will be created in the parent category whenever
   someone enters that channel.

4. Give all voice channels that are supposed to be permanent a user limit!
   Ronja will delete all voice channels without user limit once the last member
   leaves that channel!

### Install

1. Start by installing Node.js:
   https://nodejs.org/

2. Setup a bot account:
   https://discordjs.guide/preparations/setting-up-a-bot-application.html
    - Enable "Presence Intent"

3. Invite the bot to your guild:
   https://discordjs.guide/preparations/adding-your-bot-to-servers.html
   Currently Ronja.js has no multi-guild-support.

    You will need the following permissions:
    - bot, application.commands
    - Manage Roles, Manage Channels, Read Messages/View Channels, Manage Events, Send Messages,
      Embed Links, Mention Everyone, Move Members

4. Download the latest version of Ronja.js:
   https://github.com/YetAnotherGerrit/Ronja.js/releases/latest

5. Extract to whatever folder you want to use.

6. Set the `RONJA_TOKEN` environment variable

7. Run `npm run migrate` to create the database.

8. Run `npm start`

    Slash- and context menu-commands are registered with Discord automatically on
    startup and only re-synced when their definition actually changes.

### Install with Docker

1. Setup a bot account and invite it to your guild as described in steps 2 and
   3 of [Install](#install) above. Node.js itself is not needed if you use
   Docker.

2. Download the latest version of Ronja.js:
   https://github.com/YetAnotherGerrit/Ronja.js/releases/latest

3. Extract to whatever folder you want to use.

4. Create a `.env` file next to `docker-compose.yml` containing:

    ```
    RONJA_TOKEN=your-bot-token-here
    ```

5. Run `docker compose up`

    This builds the image, runs the database migrations once, then starts the
    bot. Slash- and context menu-commands are registered with Discord
    automatically on startup and only re-synced when their definition
    actually changes.

## Upgrading from 1.x to 2.0

2.0 is not a drop-in update. It changes how Ronja stores its data and its
configuration, so replacing your files with the new release (via `git pull` or
a release ZIP) is not enough on its own:

- The database schema is now managed with Sequelize migrations instead of
  being created ad-hoc on startup.
- Bot configuration (categories, channels, FTP settings, etc.) is no longer
  read from `_SECRET/config.js`. It now lives in the database as `Setting`
  rows, and only `RONJA_TOKEN` is still read from the environment.
- New World support and Reoccurring Events were removed.

Steps to upgrade an existing installation:

1. Stop your running 1.x bot.

2. Back up your existing database file and keep your old `_SECRET/config.js`
   at hand for reference (you'll re-enter the values that still apply, see
   step 6).

3. Update your files to the 2.0 release (`git pull` or a fresh release ZIP,
   same as before). Set the `RONJA_TOKEN` environment variable as described in
   [Install](#install) above. `RONJA_CLIENT_ID` is no longer needed.

4. Run `npm run migrate` once to create the new database and its tables. Then
   run:

    ```bash
    npm run migrate-legacy -- /path/to/your/old/database.sqlite
    ```

    This carries over your games, play history, and each member's "ping me"
    preference from the old database into the new one. It's safe to re-run.

    If you're using Docker, run both commands through the `migrations`
    service instead, bind-mounting your old database file in:

    ```bash
    docker compose run --rm migrations npm run migrate
    docker compose run --rm \
      -v /path/to/your/old/database.sqlite:/legacy.sqlite:ro \
      migrations npm run migrate-legacy -- /legacy.sqlite
    ```

5. Run `npm start` (or `docker compose up` if you're using Docker).

6. Reconfigure your settings using the `/settings` admin command in Discord:
   `/settings list` shows every available setting, its current value, and a
   description; `/settings set <name> <value>` updates one.

    Your old `_SECRET/config.js` keys map onto the new `Setting` names like
    this:

    | Old `_SECRET/config.js` key                             | New `Setting` name         |
    | ------------------------------------------------------- | -------------------------- |
    | `timeZone`                                              | `timezone`                 |
    | `dtcGamesCategory`                                      | `dtcGamesCategory`         |
    | `dtcArchivedGamesCategory`                              | `dtcArchivedGamesCategory` |
    | `dtcNotificationChannel`                                | `dtcNotificationChannel`   |
    | `daysToArchive`                                         | `dtcDaysToArchive`         |
    | `top10CronKanal`                                        | `top10CronChannel`         |
    | `top10Weekly` / `top10Monthly` / `top10Yearly`          | unchanged                  |
    | `icalFtpServer` / `icalFtpUsername` / `icalFtpPassword` | unchanged                  |
    | `icalUrl`                                               | unchanged                  |
    | `clientId` / `token` / `guildId`                        | removed, see step 3        |
    | `newWorldChannel` / `newWorldServer`                    | removed, feature dropped   |

    `/settings list` is the authoritative source for what's available and
    what each one does, including a few new settings that didn't exist in 1.x
    (they come with sensible defaults, so only change them if you want to).

<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->
