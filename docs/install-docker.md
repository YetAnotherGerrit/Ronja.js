# Install with Docker

1. Set up a bot account:
   https://discordjs.guide/legacy/preparations/app-setup
    - Enable "Presence Intent"

2. Invite the bot to your guild:
   https://discordjs.guide/legacy/preparations/adding-your-app
   Currently Ronja.js has no multi-guild support.

    You will need the following permissions:
    - bot, application.commands
    - Manage Roles, Manage Channels, Read Messages/View Channels, Manage Events, Send Messages,
      Embed Links, Mention Everyone, Move Members

    Node.js itself is not needed if you use Docker.

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
