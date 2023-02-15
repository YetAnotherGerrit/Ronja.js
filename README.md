# Ronja.js

## Introduction

My approach to a discord.js bot. Also my first node.js-project; so more
of a learning experience, than a serious public project.

A bot for discord servers that provide a multi gaming community for a circle of
friends. Initial intent was to provide support for the situation when you want
to play with your friends and need to decide on what game to play.

### Disclaimer

Currently only with German strings. Highly personalized for my server.

## Overview

### Features

- Dynamicly created voice channels
  - Let the users create temporary channels as needed.
  - Rename voice channels based on the dominant game that is played by
    the voice channel's members.
- Dynamicly created text channels
  - Channels for specific games are created when a specific amount of
    users on the server are owning the same game.
  - Automatic archiving of channels that are no longer in use
    or from games that are not played anymore.
- /zocken command to find people to game with by assisting on what common
  games they have.
- /top10 command to show the most popular games on the server.
- Serverprofil command to show common games for a specific user.
- Serverstatus from AmazonGames (Lost Ark, New World).
- Reoccurring Events (weekly, bi-weekly, n-weekly so far).

### Known issues

Terrible error handling.

## Installation

1. Start by installing Node.js:
   https://nodejs.org/

2. Setup a bot account:
   https://discordjs.guide/preparations/setting-up-a-bot-application.html

3. Invite the bot to your server:
   https://discordjs.guide/preparations/adding-your-bot-to-servers.html
   Currently Ronja.js has no multi-server-support.

4. Get the latest repo of Ronja.js:
   https://docs.github.com/de/repositories/creating-and-managing-repositories/cloning-a-repository

5. Install the required packages. Run the following command in the base directory of Ronja.js:
   `npm install`

6. Rename the "_SECRET.example" directory to "_SECRET".

7. Edit the "_SECRET/config.json"-file.
   - clientId, guildId and token are from step 2 and step 3.
   - https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-

8. Run the command:
   `node index.js`
 
<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->
