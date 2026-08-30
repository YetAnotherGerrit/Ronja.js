const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const SENSITIVE_NAME = /password|token|secret/i;
const SNOWFLAKE = /^\d{17,20}$/;

function isSensitive(name) {
    return SENSITIVE_NAME.test(name);
}

function formatValue(setting) {
    if (setting.value === null || setting.value === undefined || setting.value === "") {
        return "*(not set)*";
    }
    return isSensitive(setting.name) ? "||••••••••||" : `\`${setting.value}\``;
}

const mySettings = {
    commands: [
        new SlashCommandBuilder()
            .setName("settings")
            .setDescription("View or change Ronja's server configuration.")
            .setDescriptionLocalizations({
                de: "Zeige oder ändere Ronjas Server-Konfiguration.",
            })
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false)
            .addSubcommand((sub) =>
                sub
                    .setName("list")
                    .setDescription("List all available settings and their current values.")
                    .setDescriptionLocalizations({
                        de: "Liste alle verfügbaren Einstellungen und ihre aktuellen Werte auf.",
                    })
            )
            .addSubcommand((sub) =>
                sub
                    .setName("set")
                    .setDescription("Update a setting.")
                    .setDescriptionLocalizations({ de: "Ändere eine Einstellung." })
                    .addStringOption((option) =>
                        option
                            .setName("name")
                            .setDescription("The setting to update (see /settings list).")
                            .setDescriptionLocalizations({
                                de: "Die zu ändernde Einstellung (siehe /settings list).",
                            })
                            .setRequired(true)
                    )
                    .addStringOption((option) =>
                        option
                            .setName("value")
                            .setDescription("The new value.")
                            .setDescriptionLocalizations({ de: "Der neue Wert." })
                            .setRequired(true)
                    )
            ),
    ],

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "settings") return;

        if (interaction.options.getSubcommand() === "list") {
            await this.handleList(interaction);
        } else if (interaction.options.getSubcommand() === "set") {
            await this.handleSet(interaction);
        }
    },

    handleList: async function (interaction) {
        await interaction.deferReply({ ephemeral: true });

        let settings = await this.client.db.Setting.findAll({ order: [["name", "ASC"]] });

        let embeds = [];
        for (let i = 0; i < settings.length; i += 25) {
            let e = new EmbedBuilder().setColor(Colors.Blue);
            if (i === 0) e.setTitle(this.l(interaction.locale, "Settings"));

            settings.slice(i, i + 25).forEach((setting) => {
                e.addFields([
                    {
                        name: setting.name,
                        value: `${formatValue(setting)} — ${setting.description || ""}`,
                    },
                ]);
            });

            embeds.push(e);
        }

        interaction.editReply({ embeds });
    },

    handleSet: async function (interaction) {
        await interaction.deferReply({ ephemeral: true });

        let name = interaction.options.getString("name");
        let value = interaction.options.getString("value");

        let setting = await this.client.db.Setting.findOne({ where: { name } });

        if (!setting) {
            interaction.editReply({
                content: this.l(
                    interaction.locale,
                    "Unknown setting %s. Use /settings list to see all available settings.",
                    name
                ),
            });
            return;
        }

        if (setting.type === "boolean" && value !== "true" && value !== "false") {
            interaction.editReply({
                content: this.l(interaction.locale, "%s expects either true or false.", name),
            });
            return;
        }

        if (setting.type === "integer" && !/^-?\d+$/.test(value)) {
            interaction.editReply({
                content: this.l(interaction.locale, "%s expects a whole number.", name),
            });
            return;
        }

        if (
            (setting.type === "discordChannel" || setting.type === "discordCategory") &&
            !SNOWFLAKE.test(value)
        ) {
            interaction.editReply({
                content: this.l(interaction.locale, "%s expects a channel/category ID.", name),
            });
            return;
        }

        this.client.myConfigSet(name, value);

        interaction.editReply({
            content: this.l(
                interaction.locale,
                "Updated %s to %s.",
                name,
                isSensitive(name) ? "||••••••••||" : value
            ),
        });
    },
};

module.exports = mySettings;
