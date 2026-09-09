const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");

const SENSITIVE_NAME = /password|token|secret/i;
const MAX_PICKER_OPTIONS = 25;

function isSensitive(name) {
    return SENSITIVE_NAME.test(name);
}

async function resolveChannelName(guild, id) {
    if (!id) return null;
    let channel =
        guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
    return channel ? channel.name : null;
}

// Plain text (no markdown) — safe for select menu option descriptions, which render literally.
async function plainValue(guild, setting) {
    if (setting.value === null || setting.value === undefined || setting.value === "") {
        return "(not set)";
    }
    if (isSensitive(setting.name)) {
        return "••••••••";
    }
    if (setting.type === "discordChannel" || setting.type === "discordCategory") {
        let name = await resolveChannelName(guild, setting.value);
        return name ? `#${name}` : `${setting.value} (not found)`;
    }
    return setting.value;
}

function embedValue(plain, setting) {
    if (plain === "(not set)") return "*(not set)*";
    if (isSensitive(setting.name)) return "||••••••••||";
    return `\`${plain}\``;
}

function groupByCategory(settings) {
    let categories = new Map();
    for (let setting of settings) {
        let category = setting.category || "General";
        if (!categories.has(category)) categories.set(category, []);
        categories.get(category).push(setting);
    }
    for (let group of categories.values()) {
        group.sort((a, b) => a.name.localeCompare(b.name));
    }
    return categories;
}

const mySettings = {
    collectorTimeout: 14 * 60 * 1000,

    commands: [
        new SlashCommandBuilder()
            .setName("settings")
            .setDescription("View or change Ronja's server configuration.")
            .setDescriptionLocalizations({
                de: "Zeige oder ändere Ronjas Server-Konfiguration.",
            })
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .setDMPermission(false),
    ],

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "settings") return;
        await this.handleSettings(interaction);
    },

    handleSettings: async function (interaction) {
        let settings = await this.client.db.Setting.findAll({
            order: [
                ["category", "ASC"],
                ["name", "ASC"],
            ],
        });
        let settingsByName = new Map(settings.map((s) => [s.name, s]));
        let categories = groupByCategory(settings);

        let view = this.renderHome(categories, interaction.locale);
        let message = await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: this.collectorTimeout,
        });

        collector.on("collect", async (i) => {
            try {
                let [action, category, name, value] = i.customId.split(":");

                switch (action) {
                    case "settingsHome":
                        await i.update(this.renderHome(categories, i.locale));
                        break;

                    case "settingsCategory":
                        await i.update(
                            await this.renderList(
                                i.guild,
                                category,
                                categories.get(category),
                                i.locale
                            )
                        );
                        break;

                    case "settingsPick": {
                        let setting = settingsByName.get(i.values[0]);
                        await i.update(
                            await this.renderDetail(i.guild, category, setting, i.locale)
                        );
                        break;
                    }

                    case "settingsBool": {
                        let setting = settingsByName.get(name);
                        this.client.myConfigSet(name, value);
                        setting.value = value;
                        await i.update(
                            await this.renderDetail(i.guild, category, setting, i.locale)
                        );
                        break;
                    }

                    case "settingsChannel": {
                        let setting = settingsByName.get(name);
                        this.client.myConfigSet(name, i.values[0]);
                        setting.value = i.values[0];
                        await i.update(
                            await this.renderDetail(i.guild, category, setting, i.locale)
                        );
                        break;
                    }

                    case "settingsEdit":
                        await this.handleEdit(i, category, settingsByName.get(name));
                        break;
                }
            } catch (err) {
                console.error("Error handling /settings interaction:", err);
            }
        });

        collector.on("end", async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch {
                // The ephemeral message may already be gone (e.g. dismissed by the admin).
            }
        });
    },

    handleEdit: async function (interaction, category, setting) {
        let modalId = `settingsModal:${category}:${setting.name}`;

        let input = new TextInputBuilder()
            .setCustomId("settingsValue")
            .setLabel(this.l(interaction.locale, "New value"))
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        if (!isSensitive(setting.name) && setting.value) {
            input.setValue(setting.value);
        }

        await interaction.showModal(
            new ModalBuilder()
                .setCustomId(modalId)
                .setTitle(this.l(interaction.locale, "Update %s", setting.name).slice(0, 45))
                .addComponents(new ActionRowBuilder().addComponents(input))
        );

        let submitted;
        try {
            submitted = await interaction.awaitModalSubmit({
                time: this.collectorTimeout,
                filter: (m) => m.customId === modalId && m.user.id === interaction.user.id,
            });
        } catch {
            return;
        }

        let value = submitted.fields.getTextInputValue("settingsValue");

        if (setting.type === "integer" && !/^-?\d+$/.test(value)) {
            await submitted.reply({
                content: this.l(interaction.locale, "%s expects a whole number.", setting.name),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        this.client.myConfigSet(setting.name, value);
        setting.value = value;

        await submitted.update(
            await this.renderDetail(submitted.guild, category, setting, submitted.locale)
        );
    },

    renderHome: function (categories, locale) {
        let buttons = [...categories.keys()]
            .sort((a, b) => a.localeCompare(b))
            .map((category) =>
                new ButtonBuilder()
                    .setCustomId(`settingsCategory:${category}`)
                    .setLabel(category)
                    .setStyle(ButtonStyle.Primary)
            );

        let rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(this.l(locale, "Settings"))
                    .setDescription(this.l(locale, "Choose a category to view its settings.")),
            ],
            components: rows,
        };
    },

    renderList: async function (guild, category, settings, locale) {
        let embeds = [];
        for (let i = 0; i < settings.length; i += 25) {
            let fields = [];
            for (let setting of settings.slice(i, i + 25)) {
                let plain = await plainValue(guild, setting);
                let value = embedValue(plain, setting);
                fields.push({
                    name: setting.name,
                    value: setting.description ? `${value} — ${setting.description}` : value,
                });
            }

            let e = new EmbedBuilder().setColor(Colors.Blue).addFields(fields);
            if (i === 0) e.setTitle(category);
            embeds.push(e);
        }

        let picked = settings.slice(0, MAX_PICKER_OPTIONS);
        if (settings.length > MAX_PICKER_OPTIONS) {
            console.warn(
                `/settings category "${category}" has ${settings.length} settings; only the first ${MAX_PICKER_OPTIONS} fit in the picker.`
            );
        }

        let options = picked.map((setting) => ({
            label: setting.name,
            description: (setting.description || "").slice(0, 100),
            value: setting.name,
        }));

        return {
            embeds,
            components: [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`settingsPick:${category}`)
                        .setPlaceholder(this.l(locale, "Update a setting..."))
                        .addOptions(options)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("settingsHome")
                        .setLabel(this.l(locale, "Back"))
                        .setStyle(ButtonStyle.Secondary)
                ),
            ],
        };
    },

    renderDetail: async function (guild, category, setting, locale) {
        let plain = await plainValue(guild, setting);

        let embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(setting.name)
            .setDescription(setting.description || "")
            .addFields([
                { name: this.l(locale, "Current value"), value: embedValue(plain, setting) },
            ]);

        let backButton = new ButtonBuilder()
            .setCustomId(`settingsCategory:${category}`)
            .setLabel(this.l(locale, "Back"))
            .setStyle(ButtonStyle.Secondary);

        let rows;

        if (setting.type === "boolean") {
            rows = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`settingsBool:${category}:${setting.name}:true`)
                        .setLabel(this.l(locale, "True"))
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`settingsBool:${category}:${setting.name}:false`)
                        .setLabel(this.l(locale, "False"))
                        .setStyle(ButtonStyle.Danger),
                    backButton
                ),
            ];
        } else if (setting.type === "discordChannel" || setting.type === "discordCategory") {
            rows = [
                new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId(`settingsChannel:${category}:${setting.name}`)
                        .setPlaceholder(this.l(locale, "Choose a channel..."))
                        .setChannelTypes(
                            setting.type === "discordCategory"
                                ? [ChannelType.GuildCategory]
                                : [ChannelType.GuildText]
                        )
                ),
                new ActionRowBuilder().addComponents(backButton),
            ];
        } else {
            rows = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`settingsEdit:${category}:${setting.name}`)
                        .setLabel(this.l(locale, "Edit"))
                        .setStyle(ButtonStyle.Primary),
                    backButton
                ),
            ];
        }

        return { embeds: [embed], components: rows };
    },
};

module.exports = mySettings;
