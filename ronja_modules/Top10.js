const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const { DateTime } = require("luxon");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const myTop10 = {
    commands: [
        new SlashCommandBuilder()
            .setName("top10")
            .setDescription("List the top 10 games by player count.")
            .setDescriptionLocalizations({
                de: "Zeigt die Top 10-Spiele nach Anzahl von Mitspielern.",
            })
            .addIntegerOption((option) =>
                option
                    .setName("days")
                    .setNameLocalizations({ de: "tage" })
                    .setDescription("Top 10 for what period?")
                    .setDescriptionLocalizations({
                        de: "Top 10 für welchen Zeitraum?",
                    })
                    .setRequired(false)
            )
            .setDMPermission(false),
    ],

    createTop10Embed: async function (lng, pDays = 14) {
        let maxgames = 10;

        let e = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(this.l(lng, "Most popular games!"))
            .setDescription(this.l(lng, "Most played games of the last %d days:", pDays));

        let s = "";

        let g = await this.client.db.Game.findAll({
            raw: true,
            attributes: ["name", [Sequelize.fn("COUNT", "*"), "cName"]],
            include: [
                {
                    model: this.client.db.GameStatus,
                    where: {
                        lastplayed: {
                            [Op.gte]: DateTime.now()
                                .setZone(this.cfg("timezone"))
                                .minus({ days: pDays })
                                .toJSDate(),
                        },
                    },
                },
            ],
            order: [
                [Sequelize.fn("count", Sequelize.col("*")), "DESC"],
                [this.client.db.GameStatus, "lastplayed", "DESC"],
            ],
            group: "Game.name",
        });

        g.forEach((gg) => {
            if (maxgames > 0) {
                s = s.concat("**", gg.cName, "**  :busts_in_silhouette:  ", gg.name, "\n");
                maxgames = maxgames - 1;
            }
        });

        e.addFields([
            {
                name: this.l(lng, "Top 10 by player count:"),
                value: s || this.l(lng, "No games have been played."),
            },
        ]);

        return e;
    },

    postTop10ToChannel: async function (pDays, pDescription) {
        this.client.channels
            .fetch(this.cfg("top10CronChannel"))
            .then((c) => {
                this.createTop10Embed(c.guild.preferredLocale, pDays)
                    .then((e) => {
                        e.setDescription(this.l(c.guild.preferredLocale, pDescription));
                        c.send({ embeds: [e] });
                    })
                    .catch(console.error);
            })
            .catch(console.error);
    },

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName == "top10") {
            await interaction.deferReply({ ephemeral: true });

            let e = await this.createTop10Embed(
                interaction.locale,
                interaction.options.getInteger("days") || 14
            );

            interaction.editReply({ embeds: [e] });
        }
    },

    hookForCron: function () {
        if (!this.cfg("top10CronChannel")) {
            console.info("INFO: no top10CronChannel set, disabling Top10-postings!");
            return [];
        }

        return [
            {
                schedule: "0 8 * * 1",
                action: () => {
                    if (this.cfg("top10Weekly"))
                        this.postTop10ToChannel(7, "The most played games of last week:");
                },
            },
            {
                schedule: "0 7 1 * *",
                action: () => {
                    if (this.cfg("top10Monthly"))
                        this.postTop10ToChannel(30, "The most played games of last month:");
                },
            },
            {
                schedule: "0 0 1 1 *",
                action: () => {
                    if (this.cfg("top10Yearly"))
                        this.postTop10ToChannel(
                            365,
                            "Happy new year! These have been the highlights of last year:"
                        );
                },
            },
        ];
    },
};

module.exports = myTop10;
