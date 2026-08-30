const { EmbedBuilder, Colors, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const myExample = {
    commands: [
        new SlashCommandBuilder()
            .setName("setlang")
            .setNameLocalizations({ de: "setzesprache" })
            .setDescription("Set you personal language as preferred server language.")
            .setDescriptionLocalizations({
                de: "Setze deine persönliche Sprache als bevorzugte Serversprache.",
            })
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false),
    ],

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName == "setlang") {
            await interaction.deferReply({ ephemeral: true });

            interaction.guild
                .setPreferredLocale(interaction.locale)
                .then((updated) => {
                    interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(Colors.Green)
                                .setTitle(this.l(interaction.locale, "Succesful!"))
                                .setDescription(
                                    this.l(
                                        interaction.locale,
                                        "Language of the guild was changed to %s.",
                                        interaction.guild.preferredLocale
                                    )
                                ),
                        ],
                    });
                })
                .catch((error) => {
                    interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(Colors.Red)
                                .setTitle(this.l(interaction.locale, "Failed!"))
                                .setDescription(
                                    this.l(
                                        interaction.locale,
                                        "Language could not be saved. Make sure the bot has the permission to change server settings."
                                    )
                                ),
                        ],
                    });
                });
        }
    },
};

module.exports = myExample;
