const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ButtonStyle,
    Colors,
    GuildScheduledEventPrivacyLevel,
    GuildScheduledEventEntityType,
    GuildScheduledEventStatus,
} = require("discord.js");
const { DateTime } = require("luxon");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const myExample = {
    hookForCron: function () {
        return [
            {
                schedule: "*/5 * * * *", // https://crontab.guru/
                action: () => {
                    console.debug("Do this every 5 minutes!");
                },

                schedule: "0 8 * * *", // https://crontab.guru/
                action: () => {
                    console.debug("Do this every morning at 8:00!");
                },
            },
        ];
    },

    // Slash-commands and context menu-commands are deployed automatically on startup.
    // Just declare them in this module's `commands` array (see other modules for examples)
    // and they'll be created/updated/removed on Discord as needed.
    hookForCommandInteraction: async function (interaction) {
        // https://discord.js.org/#/docs/discord.js/stable/class/Interaction
        if (interaction.commandName == "ping") {
            interaction.reply("Pong!");
        }
    },

    hookForContextMenuInteraction: async function (interaction) {
        // https://discord.js.org/#/docs/discord.js/stable/class/Interaction
        if (interaction.commandName == "ping") {
            interaction.reply("Pong!");
        }
    },

    hookForButtonInteraction: async function (interaction) {
        // https://discord.js.org/#/docs/discord.js/stable/class/Interaction
        if (interaction.commandName == "ping") {
            interaction.reply("Pong!");
        }
    },

    // String select menus, including ones in DMs (where interaction.member and
    // interaction.guild are null). Menus handled by a message component
    // collector reach this hook too, so always dispatch on customId.
    hookForSelectMenuInteraction: async function (interaction) {
        // https://discord.js.org/#/docs/discord.js/stable/class/StringSelectMenuInteraction
        if (interaction.customId == "examplePick") {
            interaction.reply(`You picked ${interaction.values[0]}!`);
        }
    },

    hookForVoiceUpdate: async function (oldState, newState) {
        // https://discord.js.org/#/docs/discord.js/stable/class/VoiceState
        console.debug("The voice status of a user has updated!");
    },

    hookForChannelDelete: async function (channel) {
        // https://discord.js.org/#/docs/discord.js/stable/class/GuildChannel
        console.debug("A channel has been deleted!");
    },

    hookForEventUpdate: async function (oldGuildScheduledEvent, newGuildScheduledEvent) {
        // https://discord.js.org/#/docs/discord.js/stable/class/GuildScheduledEvent
        console.debug("A scheduled guild event has been updated!");
    },

    /* TODO:
    hookForEventUserAdd
    hookForEventUserUpdate
    hookForEventUserRemove
    */

    hookForEventStart: async function (oldGuildScheduledEvent, newGuildScheduledEvent) {
        // https://discord.js.org/#/docs/discord.js/stable/class/GuildScheduledEvent
        console.debug("A scheduled guild event has started!");
    },

    hookForStartedPlaying: async function (oldPresence, newPresence, newActivity, game) {
        // https://discord.js.org/#/docs/discord.js/stable/class/ClientPresence
        // https://discord.js.org/#/docs/discord.js/stable/class/Activity
        // game = client.db.Game-entry
        console.debug("Someone started playing a game!");
    },

    // At most one module should implement this - index.js uses the first one it
    // finds. Called with the raw activity name before a Game row is looked up,
    // plus the guild (for admin DMs via client.myNotifyOwner, if needed).
    // Return undefined to leave the default exact-name findOrCreate behavior in
    // place, null to gatekeep the activity (don't track it as a Game at all), or
    // a Game instance to use directly (see ronja_modules/IGDB.js).
    hookForResolveGame: async function (gameName, guild) {
        console.debug("A game name needs resolving to a Game row!");
    },

    // At most one module should implement this - client.myGameDetails(game)
    // uses the first one it finds. Other modules call client.myGameDetails(game)
    // (never this hook directly) to decorate their output with extra details
    // about a Game row. Return null if there's nothing to offer, or an object
    // like { id, name, summary, releaseDate, platforms, rating, coverUrl } -
    // callers must treat every field as optional (see ronja_modules/IGDB.js).
    // A throw is caught and logged by myGameDetails, which then returns null.
    hookForGameDetails: async function (game) {
        console.debug("Someone wants to know more about a Game row!");
    },
};

module.exports = myExample;
