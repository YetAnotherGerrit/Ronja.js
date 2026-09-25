console.log("Ronja.js Discord Bot");
console.log("====================");

// Load database models
console.debug("Connecting to database...");
const db = require("./models/index.js");

// Load general modules
const {
    GatewayIntentBits,
    Events,
    ActivityType,
    GuildScheduledEventStatus,
} = require("discord.js");

require("dotenv").config();

const { Ronja } = require("./core/Ronja.js");
const cron = require("node-cron");

// Load Ronja's modular system
const ronja_modules = [];
ronja_modules.push(require("./ronja_modules/Calendarfeed.js"));
ronja_modules.push(require("./ronja_modules/DynamicTextChannels.js"));
ronja_modules.push(require("./ronja_modules/DynamicVoiceChannels.js"));
ronja_modules.push(require("./ronja_modules/GameInfo.js"));
ronja_modules.push(require("./ronja_modules/IGDB.js"));
ronja_modules.push(require("./ronja_modules/Serverprofil.js"));
ronja_modules.push(require("./ronja_modules/SetLanguage.js"));
ronja_modules.push(require("./ronja_modules/SteamNews.js"));
ronja_modules.push(require("./ronja_modules/Settings.js"));
ronja_modules.push(require("./ronja_modules/Top10.js"));
ronja_modules.push(require("./ronja_modules/Zocken.js"));

// Initialize the bot
const client = new Ronja({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents,
    ],
});

// Add database to bot client
client.db = db;

// Invoke a module hook without letting it crash the whole bot: a throw or a
// rejected promise from one hook must not take down every other module/guild.
function invokeHook(hookCall) {
    try {
        Promise.resolve(hookCall()).catch((err) => console.error(err));
    } catch (err) {
        console.error(err);
    }
}

// When the client is ready prepare the modules
client.once(Events.ClientReady, async () => {
    await client.myReady(ronja_modules);

    ronja_modules.forEach((m) => {
        m.client = client;

        m.l = function () {
            return this.client.myTranslator(...arguments);
        };

        m.cfg = function (name) {
            return this.client.myConfigGet(name);
        };

        if (m.hookForCron) {
            m.hookForCron().forEach((mc) => {
                if (!cron.validate(mc.schedule))
                    console.error(`ERROR: ${mc.schedule} is not a valid cron pattern.`);
                cron.schedule(mc.schedule, () => invokeHook(mc.action), {
                    timezone: client.myConfig.timezone,
                });
            });
        }
    });

    // Only once every module has its client, l() and cfg().
    ronja_modules.forEach((m) => {
        if (m.hookForReady) invokeHook(() => m.hookForReady());
    });

    console.log("Ready!");
});

// Listen for Interactions and forward to all modules
client.on(Events.InteractionCreate, async (interaction) => {
    // Sent on every keystroke in an autocompleted option - too noisy to log.
    if (interaction.isAutocomplete()) {
        ronja_modules.forEach((m) => {
            if (m.hookForAutocompleteInteraction)
                invokeHook(() => m.hookForAutocompleteInteraction(interaction));
        });
        return;
    }

    // interaction.member is null for interactions in DMs (e.g. the IGDB sync's
    // questions to the guild owner), so fall back to the user.
    console.log(
        `${(interaction.member ?? interaction.user).displayName} used commandName ${interaction.commandName} (${interaction.customId}).`
    );

    if (interaction.isCommand()) {
        ronja_modules.forEach((m) => {
            if (m.hookForCommandInteraction)
                invokeHook(() => m.hookForCommandInteraction(interaction));
        });
    }

    if (interaction.isContextMenuCommand()) {
        ronja_modules.forEach((m) => {
            if (m.hookForContextMenuInteraction)
                invokeHook(() => m.hookForContextMenuInteraction(interaction));
        });
    }

    if (interaction.isButton()) {
        ronja_modules.forEach((m) => {
            if (m.hookForButtonInteraction)
                invokeHook(() => m.hookForButtonInteraction(interaction));
        });
    }

    if (interaction.isStringSelectMenu()) {
        ronja_modules.forEach((m) => {
            if (m.hookForSelectMenuInteraction)
                invokeHook(() => m.hookForSelectMenuInteraction(interaction));
        });
    }
});

// Listen for VoiceStateUpdate and forward to all modules
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    ronja_modules.forEach((m) => {
        if (m.hookForVoiceUpdate) invokeHook(() => m.hookForVoiceUpdate(oldState, newState));
    });
});

// Listen for MessageCreate and forward to all modules. Without the privileged
// Message Content intent, message.content is empty for others' messages.
client.on(Events.MessageCreate, async (message) => {
    ronja_modules.forEach((m) => {
        if (m.hookForMessageCreate) invokeHook(() => m.hookForMessageCreate(message));
    });
});

// Listen for ChannelDelete and forward to all modules
client.on(Events.ChannelDelete, async (channel) => {
    ronja_modules.forEach((m) => {
        if (m.hookForChannelDelete) invokeHook(() => m.hookForChannelDelete(channel));
    });
});

// Listen for GuildScheduledEventUserAdd and forward to all modules
client.on(Events.GuildScheduledEventUserAdd, async (oGuildScheduledEvent, oUser) => {
    ronja_modules.forEach((m) => {
        if (m.hookForEventUserAdd)
            invokeHook(() => m.hookForEventUserAdd(oGuildScheduledEvent, oUser));
        if (m.hookForEventUserUpdate)
            invokeHook(() => m.hookForEventUserUpdate(oGuildScheduledEvent, oUser));
    });
});

// Listen for GuildScheduledEventUserRemove and forward to all modules
client.on(Events.GuildScheduledEventUserRemove, async (oGuildScheduledEvent, oUser) => {
    ronja_modules.forEach((m) => {
        if (m.hookForEventUserRemove)
            invokeHook(() => m.hookForEventUserRemove(oGuildScheduledEvent, oUser));
        if (m.hookForEventUserUpdate)
            invokeHook(() => m.hookForEventUserUpdate(oGuildScheduledEvent, oUser));
    });
});

// Listen for GuildScheduledEventUpdate and forward to all modules
client.on(
    Events.GuildScheduledEventUpdate,
    async (oldGuildScheduledEvent, newGuildScheduledEvent) => {
        ronja_modules.forEach((m) => {
            if (m.hookForEventUpdate)
                invokeHook(() =>
                    m.hookForEventUpdate(oldGuildScheduledEvent, newGuildScheduledEvent)
                );
        });

        if (
            newGuildScheduledEvent.status == GuildScheduledEventStatus.Active &&
            oldGuildScheduledEvent.status != GuildScheduledEventStatus.Active
        ) {
            ronja_modules.forEach((m) => {
                if (m.hookForEventStart)
                    invokeHook(() =>
                        m.hookForEventStart(oldGuildScheduledEvent, newGuildScheduledEvent)
                    );
            });
        }
    }
);

// Listen for PresenceUpdate, update games played and forward to all modules if someone started playing a game
client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (newPresence.member.user.bot) return;

    // Through invokeHook, so a failing lookup (e.g. a locked database) is logged
    // instead of becoming an unhandled rejection that ends the process.
    newPresence.activities.forEach((newActivity) =>
        invokeHook(async () => {
            if (newActivity.type === ActivityType.Playing) {
                const gameName = client.myResolveGameName(newActivity);
                // Activity can't be attributed to a real game (e.g. a GeForce NOW
                // session without a discoverable game title) - ignore it entirely.
                if (!gameName) return;

                // Check if user started playing....
                let justStarted = true;
                // If the activity is already in the old state, they did not start.
                oldPresence?.activities.forEach((oldActivity) => {
                    if (client.myResolveGameName(oldActivity) === gameName) justStarted = false;
                });

                if (justStarted) {
                    // At most one module is expected to implement hookForResolveGame (IGDB
                    // today): it can gatekeep untracked activities (returning null) or hand
                    // back an already-resolved/deduped Game row. undefined means "not
                    // handled" (module absent, or not configured) - fall back to a plain
                    // exact-name match, same as before this hook existed.
                    let resolver = ronja_modules.find((m) => m.hookForResolveGame);
                    let resolvedGame = resolver
                        ? await resolver.hookForResolveGame(gameName, newPresence.guild)
                        : undefined;

                    if (resolvedGame === null) return;

                    let game =
                        resolvedGame ??
                        (
                            await client.myFindOrCreate(client.db.Game, {
                                where: { name: gameName },
                            })
                        )[0];

                    console.log(`${newPresence.member.displayName} starts playing ${game.name}.`);

                    let [gamePlayed, gamePlayedCreated] = await client.myFindOrCreate(
                        client.db.GameStatus,
                        {
                            where: {
                                GameId: game.id,
                                member: newPresence.member.id,
                            },
                            defaults: { lastplayed: newActivity.createdTimestamp },
                        }
                    );

                    if (gamePlayedCreated == false) {
                        await gamePlayed.update({
                            lastplayed: newActivity.createdTimestamp,
                        });
                    }

                    ronja_modules.forEach((m) => {
                        if (m.hookForStartedPlaying)
                            invokeHook(() =>
                                m.hookForStartedPlaying(oldPresence, newPresence, newActivity, game)
                            );
                    });
                }
            }
        })
    );
});

// client.on(Events.Debug, console.debug);
client.on(Events.Warn, console.warn);
client.on(Events.Error, console.error);

client.login(process.env.RONJA_TOKEN);
