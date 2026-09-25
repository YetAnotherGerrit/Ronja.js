const {
    EmbedBuilder,
    Colors,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    MessageFlags,
} = require("discord.js");
const Sequelize = require("sequelize");
const { multiplayerGamesWhere, playerLimit } = require("../core/gameList.js");

const myServerprofil = {
    commands: [
        new ContextMenuCommandBuilder()
            .setName("Serverprofile")
            .setNameLocalizations({ de: "Serverprofil" })
            .setType(ApplicationCommandType.User)
            .setDMPermission(false),
    ],

    toLocaleDateStringCountry: "de-DE",
    toLocaleDateStringFormat: {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    },

    hookForContextMenuInteraction: async function (interaction) {
        if (interaction.commandName == "Serverprofile") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            let m = await interaction.guild.members.fetch(interaction.options.getUser("user").id);

            let e = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(this.l(interaction.locale, "Profile of %s", m.displayName))
                .setThumbnail(m.displayAvatarURL())
                .setDescription(
                    this.l(
                        interaction.locale,
                        `%s is on this discord server since %s.`,
                        m.displayName,
                        m.joinedAt.toLocaleDateString(
                            this.toLocaleDateStringCountry, // TODO replace config with using the locale of the client/interaction
                            this.toLocaleDateStringFormat
                        )
                    )
                );

            if (interaction.member != m) {
                let s = "";
                let g = await this.client.db.Game.findAll({
                    raw: true,
                    attributes: ["name", "onlineMaxPlayers", [Sequelize.fn("COUNT", "*"), "cName"]],
                    where: multiplayerGamesWhere,
                    include: [
                        {
                            model: this.client.db.GameStatus,
                            where: {
                                member: [interaction.member.id, m.id],
                            },
                        },
                    ],
                    order: [
                        [Sequelize.fn("count", Sequelize.col("*")), "DESC"],
                        ["name", "ASC"],
                    ],
                    group: "Game.name",
                });

                g.forEach((gg) => {
                    if (gg.cName === 2) {
                        s = s.concat(
                            gg.name,
                            playerLimit(this.client, interaction.locale, gg.onlineMaxPlayers),
                            "\n"
                        );
                    }
                });

                if (s != "") {
                    e.addFields([
                        {
                            name: this.l(interaction.locale, "Common games"),
                            value: s,
                        },
                    ]);
                }
            }

            interaction.editReply({ embeds: [e] });
        }
    },
};

module.exports = myServerprofil;
