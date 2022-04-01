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
  - TODO: Automatic archiving of channels that are no longer in use
    or from games that are not played anymore.
- /zocken command to find people to game with by assisting on what common
  games they have.
- /top10 command to show the most popular games on the server.
- Serverprofil command to show common games for a specific user.
- Serverstatus from AmazonGames (Lost Ark, New World).

### Known issues

Terrible error handling.

## Installation

Not available yet.
 
<!-- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax -->