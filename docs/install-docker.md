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
      Embed Links, Move Members

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

3. Download the latest version of Ronja.js:
   https://github.com/YetAnotherGerrit/Ronja.js/releases/latest

4. Extract to whatever folder you want to use.

5. Create a `.env` file next to `docker-compose.yml` containing:

    ```
    RONJA_TOKEN=your-bot-token-here
    ```

6. Run `docker compose up`

    This builds the image, runs the database migrations once, then starts the
    bot. Slash- and context-menu-commands are registered with Discord
    automatically on startup and only re-synced when their definition
    actually changes.
