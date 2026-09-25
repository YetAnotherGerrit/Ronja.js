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

    // Autocomplete for a command option declared with .setAutocomplete(true),
    // sent on every keystroke. Answer within 3 seconds with at most 25
    // choices; dispatch on commandName (see /gameinfo in GameInfo.js).
    hookForAutocompleteInteraction: async function (interaction) {
        // https://discord.js.org/#/docs/discord.js/stable/class/AutocompleteInteraction
        if (interaction.commandName == "ping") {
            await interaction.respond([{ name: "Pong!", value: "pong" }]);
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
    // like { id, name, url, summary, releaseDate, platforms, genres, gameModes,
    // multiplayer, timeToBeat, websites, rating, coverUrl } - callers must treat
    // every field as optional (see mapGameDetails in ronja_modules/IGDB.js).
    // core/gameCard.js renders it as the game card embed.
    // A throw is caught and logged by myGameDetails, which then returns null.
    hookForGameDetails: async function (game) {
        console.debug("Someone wants to know more about a Game row!");
    },

    // At most one module should implement this - client.myGameSearch(name,
    // limit) uses the first one it finds. Return up to `limit` games named
    // like `name` as [{ igdbId, name, releaseYear }], or undefined if this
    // module can't search right now (e.g. isn't configured). A throw is caught
    // and logged by myGameSearch, which then returns null (see IGDB.js).
    hookForGameSearch: async function (name, limit) {
        console.debug("Someone is looking for a game by name!");
    },

    // Not fanned out from a Discord event: /gameinfo (ronja_modules/GameInfo.js)
    // asks every module for buttons to put under a game's card, shown to
    // `member` only. Return an array of ButtonBuilders (all modules together
    // get one row of 5) and handle their clicks in hookForButtonInteraction -
    // or return [] (see the Join/Leave channel buttons in DynamicTextChannels.js).
    hookForGameCardButtons: async function (game, member, locale) {
        return [
            new ButtonBuilder()
                .setCustomId(`exampleCardButton:${game.id}`)
                .setLabel(this.l(locale, "Example"))
                .setStyle(ButtonStyle.Secondary),
        ];
    },

    // Not fanned out from a Discord event: /settings (ronja_modules/Settings.js)
    // asks every module for the choices of a "multiselect" setting and uses the
    // first non-empty answer. Return [{ value, label, description? }] (at most
    // 25, labels translated for `locale`) for a setting this module owns, or
    // undefined for any other. The setting's value is the comma-separated list
    // of picked values, e.g. "cover,summary" (see gameCardDetails in GameInfo.js).
    hookForSettingOptions: function (name, locale) {
        if (name === "exampleChoices") {
            return [
                { value: "a", label: this.l(locale, "Option A") },
                { value: "b", label: this.l(locale, "Option B") },
            ];
        }
    },
};

module.exports = myExample;
