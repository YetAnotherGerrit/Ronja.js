const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    RoleSelectMenuBuilder,
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
    if (setting.type === "discordRole") {
        let role = guild.roles.cache.get(setting.value);
        return role ? `@${role.name}` : `${setting.value} (not found)`;
    }
    return setting.value;
}

// A whole hour of the day, 0-23 - the format of "hour" settings (see IGDB.js' igdbSyncHour).
const HOUR_PATTERN = /^([01]?\d|2[0-3])$/;

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

    // The choices of a "multiselect" setting, from the first module whose
    // hookForSettingOptions knows it: [{ value, label, description? }].
    settingOptions: function (setting, locale) {
        for (let m of this.client.myModules) {
            let options = m.hookForSettingOptions?.(setting.name, locale);
            if (options?.length) return options.slice(0, MAX_PICKER_OPTIONS);
        }
        return [];
    },

    // Like plainValue, but a "multiselect" setting (a comma-separated list of
    // option values) shows the labels of its picked options.
    displayValue: async function (guild, setting, locale) {
        if (setting.type !== "multiselect") return await plainValue(guild, setting);
        let picked = (setting.value || "").split(",");
        let labels = this.settingOptions(setting, locale)
            .filter((o) => picked.includes(o.value))
            .map((o) => o.label);
        return labels.length ? labels.join(", ") : this.l(locale, "(none)");
    },

    commands: [
        new SlashCommandBuilder()
            .setName("settings")
            .setNameLocalizations({ de: "einstellungen" })
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

        // Values waiting for the answer to a module's question, by setting name.
        let pending = new Map();

        let view = this.renderHome(categories, interaction.locale);
        let message = await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });

        let collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: this.collectorTimeout,
        });

        collector.on("collect", async (i) => {
            try {
                let [action, category, name, value] = i.customId.split(":");
                let change = (newValue) =>
                    this.changeSetting(i, category, settingsByName.get(name), newValue, pending);

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

                    case "settingsBool":
                        await change(value);
                        break;

                    case "settingsChannel":
                        await change(i.values[0]);
                        break;

                    case "settingsRole": {
                        let problem = this.roleProblem(
                            i.guild.roles.cache.get(i.values[0]),
                            i.locale
                        );
                        if (problem) {
                            await i.reply({
                                embeds: [
                                    new EmbedBuilder().setColor(Colors.Red).setDescription(problem),
                                ],
                                flags: MessageFlags.Ephemeral,
                            });
                            break;
                        }
                        await change(i.values[0]);
                        break;
                    }

                    case "settingsClear":
                        await change("");
                        break;

                    case "settingsMulti":
                        await change(i.values.join(","));
                        break;

                    case "settingsAnswer": {
                        // Already answered, e.g. by a double click.
                        if (!pending.has(name)) break;
                        let newValue = pending.get(name);
                        pending.delete(name);
                        await this.saveSetting(
                            i,
                            category,
                            settingsByName.get(name),
                            newValue,
                            value
                        );
                        break;
                    }

                    case "settingsEdit":
                        await this.handleEdit(i, category, settingsByName.get(name), pending);
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

    // Why Ronja can't give `role` to members, or null if she can.
    roleProblem: function (role, locale) {
        let me = role.guild.members.me;
        if (role.id === role.guild.id) {
            return this.l(locale, "Everyone has @everyone already - please choose another role.");
        }
        if (role.managed) {
            return this.l(
                locale,
                "%s is managed by an integration, so I can't give it to members - please choose another role.",
                role.name
            );
        }
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return this.l(
                locale,
                "I need the Manage Roles permission to give %s to members.",
                role.name
            );
        }
        if (role.comparePositionTo(me.roles.highest) >= 0) {
            return this.l(
                locale,
                "%s is not below my highest role, so I can't give it to members. Move my role above it in the server settings, or choose another role.",
                role.name
            );
        }
        return null;
    },

    // The first question a module asks before `setting` changes to `value`
    // (see hookForSettingQuestion in Example.js), or null.
    settingQuestion: async function (setting, value, locale) {
        for (let m of this.client.myModules) {
            let question = await m.hookForSettingQuestion?.(
                setting.name,
                setting.value,
                value,
                locale
            );
            if (question) return question;
        }
        return null;
    },

    // Changes `setting` to `value` from the component or modal `interaction` -
    // unless a module has a question about that: then the value waits in
    // `pending` until it's answered (settingsAnswer).
    changeSetting: async function (interaction, category, setting, value, pending) {
        let question =
            value !== setting.value &&
            (await this.settingQuestion(setting, value, interaction.locale));
        if (question) {
            pending.set(setting.name, value);
            await interaction.update(
                this.renderQuestion(category, setting, question, interaction.locale)
            );
            return;
        }
        await this.saveSetting(interaction, category, setting, value);
    },

    // Saves `setting`, then tells every module (hookForSettingChange), with the
    // `answer` to the question about it, if one was asked.
    saveSetting: async function (interaction, category, setting, value, answer) {
        let oldValue = setting.value;
        this.client.myConfigSet(setting.name, value);
        setting.value = value;
        await interaction.update(
            await this.renderDetail(interaction.guild, category, setting, interaction.locale)
        );

        // After the update, as modules may take longer than Discord waits for it.
        for (let m of this.client.myModules) {
            try {
                await m.hookForSettingChange?.(setting.name, oldValue, value, answer);
            } catch (err) {
                console.error(`Error handling the change of setting ${setting.name}:`, err);
            }
        }
    },

    handleEdit: async function (interaction, category, setting, pending) {
        let modalId = `settingsModal:${category}:${setting.name}`;

        let input = new TextInputBuilder()
            .setCustomId("settingsValue")
            .setLabel(this.l(interaction.locale, "New value"))
            .setStyle(TextInputStyle.Short)
            // An hour can be cleared, which turns off whatever it schedules.
            .setRequired(setting.type !== "hour");

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

        let value = submitted.fields.getTextInputValue("settingsValue").trim();

        let invalid = null;
        if (setting.type === "integer" && !/^-?\d+$/.test(value)) {
            invalid = this.l(interaction.locale, "%s expects a whole number.", setting.name);
        } else if (setting.type === "hour" && value && !HOUR_PATTERN.test(value)) {
            invalid = this.l(
                interaction.locale,
                "%s expects an hour from 0 to 23, or nothing to turn it off.",
                setting.name
            );
        }
        if (invalid) {
            await submitted.reply({
                embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(invalid)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await this.changeSetting(submitted, category, setting, value, pending);
    },

    renderHome: function (categories, locale) {
        let buttons = [...categories.keys()]
            .sort((a, b) => a.localeCompare(b))
            .map((category) =>
                this.client
                    .myButton("📁")
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
                let plain = await this.displayValue(guild, setting, locale);
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
                    this.client
                        .myButton("↩️")
                        .setCustomId("settingsHome")
                        .setLabel(this.l(locale, "Back"))
                        .setStyle(ButtonStyle.Secondary)
                ),
            ],
        };
    },

    renderQuestion: function (category, setting, question, locale) {
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(setting.name)
                    .setDescription(question.description),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    ...question.answers.map((answer) =>
                        this.client
                            .myButton(answer.emoji)
                            .setCustomId(`settingsAnswer:${category}:${setting.name}:${answer.id}`)
                            .setLabel(answer.label)
                            .setStyle(answer.style ?? ButtonStyle.Primary)
                    ),
                    this.client
                        .myButton("↩️")
                        .setCustomId(`settingsCategory:${category}`)
                        .setLabel(this.l(locale, "Back"))
                        .setStyle(ButtonStyle.Secondary)
                ),
            ],
        };
    },

    renderDetail: async function (guild, category, setting, locale) {
        let plain = await this.displayValue(guild, setting, locale);
        let options = setting.type === "multiselect" ? this.settingOptions(setting, locale) : [];

        let embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(setting.name)
            .setDescription(setting.description || "")
            .addFields([
                { name: this.l(locale, "Current value"), value: embedValue(plain, setting) },
            ]);

        let backButton = this.client
            .myButton("↩️")
            .setCustomId(`settingsCategory:${category}`)
            .setLabel(this.l(locale, "Back"))
            .setStyle(ButtonStyle.Secondary);

        let rows;

        if (setting.type === "boolean") {
            rows = [
                new ActionRowBuilder().addComponents(
                    this.client
                        .myButton("✅")
                        .setCustomId(`settingsBool:${category}:${setting.name}:true`)
                        .setLabel(this.l(locale, "True"))
                        .setStyle(ButtonStyle.Success),
                    this.client
                        .myButton("❌")
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
        } else if (setting.type === "discordRole") {
            let buttons = [backButton];
            // Clearing a role turns off whatever it's for.
            if (setting.value) {
                buttons.unshift(
                    this.client
                        .myButton("🗑️")
                        .setCustomId(`settingsClear:${category}:${setting.name}`)
                        .setLabel(this.l(locale, "Clear"))
                        .setStyle(ButtonStyle.Danger)
                );
            }
            rows = [
                new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`settingsRole:${category}:${setting.name}`)
                        .setPlaceholder(this.l(locale, "Choose a role..."))
                ),
                new ActionRowBuilder().addComponents(buttons),
            ];
        } else if (options.length) {
            let picked = (setting.value || "").split(",");
            rows = [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`settingsMulti:${category}:${setting.name}`)
                        .setPlaceholder(this.l(locale, "Choose any number of options..."))
                        .setMinValues(0)
                        .setMaxValues(options.length)
                        .addOptions(
                            options.map((o) => ({ ...o, default: picked.includes(o.value) }))
                        )
                ),
                new ActionRowBuilder().addComponents(backButton),
            ];
        } else {
            rows = [
                new ActionRowBuilder().addComponents(
                    this.client
                        .myButton("✏️")
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
