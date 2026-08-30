# Upgrading from 1.x to 2.0

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
   step 7).

3. Update your files to the 2.0 release (`git pull` or a fresh release ZIP,
   same as before). Set the `RONJA_TOKEN` environment variable as described in
   the [npm/systemd](install-npm-systemd.md) or [Docker](install-docker.md)
   install guide. `RONJA_CLIENT_ID` is no longer needed.

4. Run `npm install` to install dependencies.

5. Run `npm run migrate` once to create the new database and its tables. Then
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

6. Run `npm start` (or `docker compose up` if you're using Docker).

7. Reconfigure your settings using the `/settings` admin command in Discord:
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
