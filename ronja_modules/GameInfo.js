const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} = require("discord.js");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const { buildGameCard, gameCardDetailOptions, loadGuildInfo } = require("../core/gameCard.js");

const LOCAL_CANDIDATE_LIMIT = 10;
const SEARCH_CANDIDATE_LIMIT = 5;
const CHOICES_LIMIT = 25; // Discord's limit for autocomplete choices and select menu options.
const BUTTONS_LIMIT = 5; // Discord's limit for buttons in one row.

// What /gameinfo's name option (when picked from its autocomplete) and its
// pick menu send: "game:<Game id>" for a game Ronja tracks, "igdb:<IGDB id>"
// for one only IGDB knows.
const LOCAL_PREFIX = "game:";
const IGDB_PREFIX = "igdb:";

// /gameinfo: a game's card for whoever asked - IGDB's details (if IGDB is
// configured), who here played it recently and its text channel, with the
// buttons other modules add (see hookForGameCardButtons).
const myGameInfo = {
    collectorTimeout: 60 * 1000,

    commands: [
        new SlashCommandBuilder()
            .setName("gameinfo")
            .setNameLocalizations({ de: "spielinfo" })
            .setDescription("Look up a game: who here plays it, its text channel and more.")
            .setDescriptionLocalizations({
                de: "Zeigt ein Spiel: wer es hier spielt, seinen Textkanal und mehr.",
            })
            .addStringOption((option) =>
                option
                    .setName("name")
                    .setNameLocalizations({ de: "name" })
                    .setDescription("The name of the game to look up.")
                    .setDescriptionLocalizations({
                        de: "Der Name des gesuchten Spiels.",
                    })
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .setDMPermission(false),
    ],

    // The games Ronja tracks whose name or one of its aliases contains `text`
    // (all of them for an empty `text`), most recently played first - without
    // the ones the owner marked as "not a game".
    findLocalGames: async function (text, limit) {
        let { Game, GameAlias, GameStatus } = this.client.db;
        let where = {
            [Op.or]: [{ igdbStatus: null }, { igdbStatus: { [Op.ne]: "ignored" } }],
        };
        if (text) {
            let contains = { [Op.like]: `%${text}%` };
            let aliases = await GameAlias.findAll({ where: { name: contains } });
            where[Op.and] = [
                { [Op.or]: [{ name: contains }, { id: aliases.map((a) => a.GameId) }] },
            ];
        }

        return await Game.findAll({
            where,
            attributes: {
                include: [
                    [Sequelize.fn("MAX", Sequelize.col("GameStatuses.lastplayed")), "lastPlayed"],
                ],
            },
            include: [{ model: GameStatus, attributes: [] }],
            group: ["Game.id"],
            order: [
                [Sequelize.literal("lastPlayed"), "DESC"],
                ["name", "ASC"],
            ],
            limit,
            subQuery: false,
        });
    },

    // Pick menu options for `name`: the games Ronja tracks first, then what
    // IGDB finds (if it can be asked), without the games Ronja already has.
    findCandidates: async function (name, locale) {
        let local = await this.findLocalGames(name, LOCAL_CANDIDATE_LIMIT);
        let known = new Set(local.map((g) => g.igdbId).filter(Boolean));
        let found = (await this.client.myGameSearch(name, SEARCH_CANDIDATE_LIMIT)) ?? [];

        return [
            ...local.map((g) => ({
                label: g.name.slice(0, 100),
                description: g.get("lastPlayed") ? this.l(locale, "Played here") : undefined,
                value: `${LOCAL_PREFIX}${g.id}`,
            })),
            ...found
                .filter((r) => !known.has(r.igdbId))
                .map((r) => ({
                    label: r.name.slice(0, 100),
                    description: r.releaseYear,
                    value: `${IGDB_PREFIX}${r.igdbId}`,
                })),
        ].slice(0, CHOICES_LIMIT);
    },

    // The choices /settings offers for the gameCardDetails setting.
    hookForSettingOptions: function (name, locale) {
        if (name === "gameCardDetails") return gameCardDetailOptions(this.client, locale);
    },

    replyError: async function (interaction, message) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(message)],
            components: [],
        });
    },

    hookForAutocompleteInteraction: async function (interaction) {
        if (interaction.commandName !== "gameinfo") return;

        let games = await this.findLocalGames(
            interaction.options.getFocused().trim(),
            CHOICES_LIMIT
        );
        await interaction.respond(
            games.map((g) => ({ name: g.name.slice(0, 100), value: `${LOCAL_PREFIX}${g.id}` }))
        );
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "gameinfo") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // A game picked from the autocomplete - anything else is a name to look for.
        let name = interaction.options.getString("name").trim();
        if (name.startsWith(LOCAL_PREFIX)) {
            await this.showGame(interaction, name);
            return;
        }

        let candidates = await this.findCandidates(name, interaction.locale);
        if (!candidates.length) {
            await this.replyError(
                interaction,
                this.l(interaction.locale, 'No game found for "%s".', name)
            );
            return;
        }

        // Only one candidate at all - nothing to disambiguate, skip the picker.
        if (candidates.length === 1) {
            await this.showGame(interaction, candidates[0].value);
            return;
        }

        await this.presentGameChoices(interaction, candidates);
    },

    // Shows the card for a "game:"/"igdb:" value, replacing whatever the
    // (ephemeral) reply currently shows.
    showGame: async function (interaction, value) {
        let locale = interaction.locale;
        let game, details;
        if (value.startsWith(LOCAL_PREFIX)) {
            game = await this.client.db.Game.findByPk(value.slice(LOCAL_PREFIX.length));
            if (!game) {
                await this.replyError(
                    interaction,
                    this.l(locale, "That game is no longer known here.")
                );
                return;
            }
            details = await this.client.myGameDetails(game);
        } else {
            let igdbId = value.slice(IGDB_PREFIX.length);
            game = await this.client.db.Game.findOne({ where: { igdbId } });
            details = await this.client.myGameDetails(game ?? { igdbId, name: `IGDB #${igdbId}` });
            if (!game && !details) {
                await this.replyError(
                    interaction,
                    this.l(locale, "Could not reach IGDB right now, please try again later.")
                );
                return;
            }
        }

        // The card is ephemeral and short-lived, so it can show the guild's
        // players and the game's text channel. Without them it's still worth showing.
        let guildInfo = null;
        try {
            guildInfo = await loadGuildInfo(this.client, interaction.guild, game);
        } catch (err) {
            console.error("GameInfo: /gameinfo guild info lookup failed:", err);
        }

        let buttons = game ? await this.cardButtons(game, interaction.member, locale) : [];
        await interaction.editReply({
            embeds: [
                buildGameCard(
                    this.client,
                    details ?? { name: game.name },
                    locale,
                    guildInfo
                ).setColor(Colors.Green),
            ],
            components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [],
        });
    },

    // The buttons every module adds to the card of `game` for `member`.
    cardButtons: async function (game, member, locale) {
        let buttons = [];
        for (let m of this.client.myModules) {
            if (!m.hookForGameCardButtons) continue;
            try {
                buttons.push(...((await m.hookForGameCardButtons(game, member, locale)) ?? []));
            } catch (err) {
                console.error("GameInfo: could not add a module's card buttons:", err);
            }
        }
        return buttons.slice(0, BUTTONS_LIMIT);
    },

    // Shows the (ephemeral, invoker-only) candidate list and swaps in the
    // card once the invoking user picks one.
    presentGameChoices: async function (interaction, candidates) {
        let menu = new StringSelectMenuBuilder()
            .setCustomId("gameinfoPick")
            .setPlaceholder(this.l(interaction.locale, "Choose a game..."))
            .addOptions(candidates);

        let message = await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setDescription(
                        this.l(
                            interaction.locale,
                            "Multiple games matched - which one did you mean?"
                        )
                    ),
            ],
            components: [new ActionRowBuilder().addComponents(menu)],
        });

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id && i.customId === "gameinfoPick",
            time: this.collectorTimeout,
            max: 1,
        });

        collector.on("collect", async (i) => {
            try {
                await i.deferUpdate();
                await this.showGame(interaction, i.values[0]);
            } catch (err) {
                console.error("GameInfo: /gameinfo selection failed:", err);
            }
        });

        collector.on("end", async (collected) => {
            if (collected.size > 0) return;
            try {
                await interaction.editReply({ components: [] });
            } catch {
                // The ephemeral message may already be gone.
            }
        });
    },
};

module.exports = myGameInfo;
