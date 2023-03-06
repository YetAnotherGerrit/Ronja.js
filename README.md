# Ronja.js

## Introduction

A bot for discord servers that provide a multi gaming community for a circle of
friends. Initial intent was to provide support for the situation when you want
to play with your friends and need to decide on what game to play.

## Overview

### Disclaimer

Currently running on the @dev-branch of discord.js - but this is meant to be
temporary.

### Features

- Dynamicly created voice channels
  - Let the users create temporary channels as needed.
  - Rename voice channels based on the dominant game that is played by
    the voice channel's members.
- Dynamicly created text channels
  - Channels for specific games are created when a specific amount of
    users on the server are owning the same game.
  - Automatic archiving of channels about games that are not played anymore.
- /lfg command to find people to game with by assisting on what common
  games they have.
- /top10 command to show the most popular games on the server.
  - Also weekly, monthly and yearly top 10.
- Serverprofil command to show common games for a specific user.
- Serverstatus for New World.
- Reoccurring Events (weekly, bi-weekly, n-weekly so far).

### Known issues

Terrible error handling.

## Installation

1. Start by installing Node.js:
   https://nodejs.org/

2. Setup a bot account:
   https://discordjs.guide/preparations/setting-up-a-bot-application.html
   - Enable "Presence Intent"

3. Invite the bot to your server:
   https://discordjs.guide/preparations/adding-your-bot-to-servers.html
   Currently Ronja.js has no multi-server-support.
   
   You will need the following permissions:
   - bot, application.commands
   - Manage Roles, Manage Channels, Read Messages/View Channels, Manage Events, Send Messages,
     Embed Links, Mention Everyone, Move Members

4. Get the latest repo of Ronja.js:
   https://docs.github.com/de/repositories/creating-and-managing-repositories/cloning-a-repository

5. Run `./ronja.sh postinstall` (Linux) or `.\ronja.bat postinstall` (Windows)

6. Adjust your config file `_SECRET/config.js`.

7. Run `./ronja.sh postupdate` (Linux) or `.\ronja.bat postupdate` (Windows)

8. Run `./ronja.sh start` (Linux) or `.\ronja.bat start` (Windows)

<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->
