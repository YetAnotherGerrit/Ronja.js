# Install with Node.js and systemd

1. Start by installing Node.js:
   https://nodejs.org/

2. Set up a bot account:
   https://discordjs.guide/legacy/preparations/app-setup
    - Enable "Presence Intent" (see [Discord intents](#discord-intents) below)

3. Invite the bot to your guild:
   https://discordjs.guide/legacy/preparations/adding-your-app
   Currently Ronja.js has no multi-guild support.

    You will need the following OAuth2 scopes:
    - `bot`, `application.commands`

    And the following bot permissions:
    - View Channels, Manage Channels, Manage Roles, Manage Events, Send Messages,
      Embed Links, Move Members

### Discord intents

Ronja subscribes to these Discord gateway intents:

- Guilds
- Guild Voice States
- Guild Presences
- Guild Scheduled Events

Of these, only **Guild Presences** is a privileged intent that needs to be
enabled explicitly: on the bot's application page, open the "Bot" tab and
enable "Presence Intent" under "Privileged Gateway Intents". The other two
privileged intents Discord offers, Server Members Intent and Message Content
Intent, are not used by Ronja and don't need to be enabled.

4. Download the latest version of Ronja.js:
   https://github.com/YetAnotherGerrit/Ronja.js/releases/latest

5. Extract to whatever folder you want to use.

6. Run `npm install` to install dependencies.

7. Set the `RONJA_TOKEN` environment variable.

8. Run `npm run migrate` to create the database.

9. Run `npm start`

    Slash- and context-menu-commands are registered with Discord automatically on
    startup and only re-synced when their definition actually changes.

## Run as a systemd service (optional)

`npm start` only stays running for as long as its terminal session does. To
keep Ronja running in the background and have it restart automatically after
a crash or reboot, use the example unit file at
[`systemd/ronja.service`](../systemd/ronja.service):

1. Copy the repository to its final location (e.g. `/opt/ronja`) and create a
   dedicated user to run it as (e.g. `useradd --system --home /opt/ronja ronja`),
   then make sure that user owns the folder.

2. Create a `.env` file in that folder containing `RONJA_TOKEN=your-bot-token-here`.

3. Copy `systemd/ronja.service` to `/etc/systemd/system/ronja.service`,
   adjusting `WorkingDirectory`, `EnvironmentFile`, and `User` if you used
   different values in steps 1 and 2.

4. Run `systemctl daemon-reload`, then `systemctl enable --now ronja`.

Note that the unit's `ExecStart` runs `node index.js` directly rather than
`npm start`: `npm` wraps the process in its own shell, which can delay or
swallow the `SIGTERM` systemd sends on stop/restart, so a direct `node` call
shuts down more reliably.

## Update

1. Stop Ronja: `systemctl stop ronja` if you're running it as a service,
   otherwise stop the `npm start` process.

2. Update your files to the new release, the same way you got them initially
   (`git pull`, or download and extract a new release ZIP over the old
   files).

3. Run `npm install` to update dependencies.

4. Run `npm run migrate` to apply any new database migrations. This is safe
   to run even if there are none pending.

5. Start Ronja again: `systemctl start ronja`, or `npm start`.

Check the release notes for breaking changes before updating across major
versions — e.g. see [Upgrading from 1.x to 2.0](upgrading-1.x-to-2.0.md),
which needs extra steps beyond the ones above.
