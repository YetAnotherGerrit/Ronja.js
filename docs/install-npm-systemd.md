# Install with Node.js and systemd

1. Start by installing Node.js:
   https://nodejs.org/

2. Set up a bot account:
   https://discordjs.guide/preparations/setting-up-a-bot-application.html
    - Enable "Presence Intent"

3. Invite the bot to your guild:
   https://discordjs.guide/preparations/adding-your-bot-to-servers.html
   Currently Ronja.js has no multi-guild support.

    You will need the following permissions:
    - bot, application.commands
    - Manage Roles, Manage Channels, Read Messages/View Channels, Manage Events, Send Messages,
      Embed Links, Mention Everyone, Move Members

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
