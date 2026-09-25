# Install with Docker

1. Set up a bot account:
   https://discordjs.guide/legacy/preparations/app-setup
    - Enable "Presence Intent" (see [Discord intents](#discord-intents) below)

2. Invite the bot to your guild:
   https://discordjs.guide/legacy/preparations/adding-your-app
   Currently Ronja.js has no multi-guild support.

    You will need the following OAuth2 scopes:
    - `bot`, `application.commands`

    And the following bot permissions:
    - View Channels, Manage Channels, Manage Roles, Manage Events, Send Messages,
      Embed Links, Read Message History, Pin Messages, Move Members

    Read Message History and Pin Messages are needed for the pinned game card
    in new game text channels, and for telling empty channels (deleted) apart
    from ones with posts (archived). If Ronja lacks a permission for something
    it tries, it tells the server owner via DM.

    Node.js itself is not needed if you use Docker.

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

3. Get Ronja.js, either
    - by cloning the repository, which creates a `Ronja.js` folder:

        ```
        git clone https://github.com/YetAnotherGerrit/Ronja.js.git
        ```

        This gets the current `main` branch, which may include changes that
        aren't in a release yet.

    - or by downloading the latest release and extracting it to whatever
      folder you want to use:
      https://github.com/YetAnotherGerrit/Ronja.js/releases/latest

4. Create a `.env` file next to `docker-compose.yml` containing:

    ```
    RONJA_TOKEN=your-bot-token-here
    ```

5. Run `docker compose up`

    This builds the image, runs the database migrations once, then starts the
    bot. Slash- and context-menu-commands are registered with Discord
    automatically on startup and only re-synced when their definition
    actually changes.

## Update

1. Update your files to the new release, the same way you got them initially
   (`git pull`, or download and extract a new release ZIP over the old
   files).

2. Run `docker compose up --build`

    This rebuilds the image with the new version, re-runs the database
    migrations, and restarts the bot.

Check the release notes for breaking changes before updating across major
versions — e.g. see [Upgrading from 1.x to 2.0](upgrading-1.x-to-2.0.md),
which needs extra steps beyond the ones above.
