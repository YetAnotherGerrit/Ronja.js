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
- Serverstatus for New World.
- Reoccurring Events (weekly, bi-weekly, n-weekly so far).

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

6. Run `./ronja.sh postinstall` (Linux) or `.\ronja.bat postinstall` (Windows)

7. Adjust your config file `_SECRET/config.js`.

8. Run `./ronja.sh postupdate` (Linux) or `.\ronja.bat postupdate` (Windows)

9. Run `./ronja.sh start` (Linux) or `.\ronja.bat start` (Windows)

<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->