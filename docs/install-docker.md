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
- Guild Messages
- Guild Presences
- Guild Scheduled Events

Of these, only **Guild Presences** is a privileged intent that needs to be
enabled explicitly: on the bot's application page, open the "Bot" tab and
enable "Presence Intent" under "Privileged Gateway Intents". The other two
privileged intents Discord offers, Server Members Intent and Message Content
Intent, are not used by Ronja and don't need to be enabled.

3. Create a folder for Ronja and download
   [`docker-compose.yml`](../docker-compose.yml) into it, e.g.:

    ```
    mkdir ronja && cd ronja
    curl -O https://raw.githubusercontent.com/YetAnotherGerrit/Ronja.js/main/docker-compose.yml
    ```

    Ronja's image is published on the GitHub Container Registry
    (`ghcr.io/yetanothergerrit/ronja.js`) for every release, for `amd64` and
    `arm64` (e.g. a Raspberry Pi), and rebuilt weekly with the latest Node.js
    and OS security fixes. So you don't need Ronja's code to run it.

    If you'd rather build the image yourself, e.g. to run the current `main`
    branch, which may include changes that aren't in a release yet, clone the
    repository instead (`git clone https://github.com/YetAnotherGerrit/Ronja.js.git`)
    or download and extract the
    [latest release](https://github.com/YetAnotherGerrit/Ronja.js/releases/latest),
    and add `--build` to the `docker compose up` commands below.

4. Create a `.env` file next to `docker-compose.yml` containing:

    ```
    RONJA_TOKEN=your-bot-token-here
    ```

    This uses the image of the latest release. To stay on one version
    instead, add e.g. `RONJA_VERSION=4` (the latest 4.x release) or
    `RONJA_VERSION=4.0.0` (exactly that release). Only the latest release's
    image is rebuilt weekly, so a pinned older version doesn't get the Node.js
    and OS security fixes anymore.

5. Run `docker compose up -d`

    This downloads the image, runs the database migrations once, then starts
    the bot. Slash- and context-menu-commands are registered with Discord
    automatically on startup and only re-synced when their definition
    actually changes.

## Update

1. Run `docker compose pull && docker compose up -d`

    This downloads the latest image (or the latest one for your
    `RONJA_VERSION`), re-runs the database migrations, and restarts the bot.
    The weekly rebuilds with Node.js and OS security fixes arrive the same
    way, so it's worth running every now and then even without a new release.

    If you build the image yourself, update your files to the new release
    instead, the same way you got them initially (`git pull`, or download and
    extract a new release ZIP over the old files), and run
    `docker compose up -d --build`.

Check the release notes for breaking changes before updating across major
versions — e.g. see [Upgrading from 1.x to 2.0](upgrading-1.x-to-2.0.md),
which needs extra steps beyond the ones above.
