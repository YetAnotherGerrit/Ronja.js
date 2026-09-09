# Ronja.js

A bot for Discord guilds that provides a multi-gaming community for a circle
of friends. Initial intent was to provide support for the situation when you
want to play with your friends and need to decide on what game to play.

## Features

- Dynamically created voice channels
    - Let the members create temporary channels as needed.
    - Rename voice channels based on the dominant game that is played by
      the voice channel's members.
- Dynamically created text channels
    - Channels for specific games are created when a specific number of
      members on the guild own the same game.
    - Automatic archiving of channels about games that are not played anymore.
- /lfg command to find members to game with by assisting with what common
  games you have.
- /top10 command to show the most popular games in the guild.
    - Also weekly, monthly and yearly top 10.
- /ical command to get an ical-feed for the events you attend.
- Serverprofile command to show common games for a specific member.
- /settings command with an interactive menu to view and change Ronja's
  configuration for your guild.
- Available in English, German, Spanish, French, Italian, Portuguese, and
  Esperanto.

### Not-Features

- Ronja.js is not (yet?) built to run on more than one guild server.
- This is not a bot that you can simply invite to your guild. You will need
  to host Ronja yourself. But it doesn't require a lot of resources. It should
  run on a Raspberry Pi or any other small host.

## Setup

### Prepare your guild server

1. Create a category for dynamically created text channels.
   ID needs to be added to config later.

2. Create an archive category for dynamically created text channels.
   ID needs to be added to config later.

3. Create a "new channel"-voice channel in **some category** with a user limit
   of 1. A new voice channel will be created in the parent category whenever
   someone enters that channel.

4. Give all voice channels that are supposed to be permanent a user limit!
   Ronja will delete all voice channels without a user limit once the last member
   leaves that channel!

### Install

Pick whichever install guide matches how you want to run Ronja:

- [Install with Node.js and systemd](docs/install-npm-systemd.md)
- [Install with Docker](docs/install-docker.md)

## Upgrading from 1.x to 2.0

2.0 is not a drop-in update — see
[Upgrading from 1.x to 2.0](docs/upgrading-1.x-to-2.0.md) for the required
steps.

<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->
