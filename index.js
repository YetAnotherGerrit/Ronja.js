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
ronja_modules.push(require("./ronja_modules/Serverprofil.js"));
ronja_modules.push(require("./ronja_modules/SetLanguage.js"));
ronja_modules.push(require("./ronja_modules/Top10.js"));
ronja_modules.push(require("./ronja_modules/Zocken.js"));

// Initialize the bot
const client = new Ronja({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents,
    ],
});

// Add database to bot client
client.db = db;

// When the client is ready prepare the modules
client.once(Events.ClientReady, async () => {
    await client.myReady();

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
                cron.schedule(mc.schedule, mc.action, {
                    timezone: client.myConfig.timezone,
                });
            });
        }
    });

    console.log("Ready!");
});

// Listen for Interactions and forward to all modules
client.on(Events.InteractionCreate, async (interaction) => {
    console.log(
        `${interaction.member.displayName} used commandName ${interaction.commandName} (${interaction.customId}).`
    );

    if (interaction.isCommand()) {
        ronja_modules.forEach((m) => {
            if (m.hookForCommandInteraction) m.hookForCommandInteraction(interaction);
        });
    }

    if (interaction.isContextMenuCommand()) {
        ronja_modules.forEach((m) => {
            if (m.hookForContextMenuInteraction) m.hookForContextMenuInteraction(interaction);
        });
    }

    if (interaction.isButton()) {
        ronja_modules.forEach((m) => {
            if (m.hookForButtonInteraction) m.hookForButtonInteraction(interaction);
        });
    }
});

// Listen for VoiceStateUpdate and forward to all modules
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    ronja_modules.forEach((m) => {
        if (m.hookForVoiceUpdate) m.hookForVoiceUpdate(oldState, newState);
    });
});

// Listen for GuildScheduledEventUserAdd and forward to all modules
client.on(Events.GuildScheduledEventUserAdd, async (oGuildScheduledEvent, oUser) => {
    ronja_modules.forEach((m) => {
        if (m.hookForEventUserAdd) m.hookForEventUserAdd(oGuildScheduledEvent, oUser);
        if (m.hookForEventUserUpdate) m.hookForEventUserUpdate(oGuildScheduledEvent, oUser);
    });
});

// Listen for GuildScheduledEventUserRemove and forward to all modules
client.on(Events.GuildScheduledEventUserRemove, async (oGuildScheduledEvent, oUser) => {
    ronja_modules.forEach((m) => {
        if (m.hookForEventUserRemove) m.hookForEventUserRemove(oGuildScheduledEvent, oUser);
        if (m.hookForEventUserUpdate) m.hookForEventUserUpdate(oGuildScheduledEvent, oUser);
    });
});

// Listen for GuildScheduledEventUpdate and forward to all modules
client.on(
    Events.GuildScheduledEventUpdate,
    async (oldGuildScheduledEvent, newGuildScheduledEvent) => {
        ronja_modules.forEach((m) => {
            if (m.hookForEventUpdate)
                m.hookForEventUpdate(oldGuildScheduledEvent, newGuildScheduledEvent);
        });

        if (
            newGuildScheduledEvent.status == GuildScheduledEventStatus.Active &&
            oldGuildScheduledEvent.status != GuildScheduledEventStatus.Active
        ) {
            ronja_modules.forEach((m) => {
                if (m.hookForEventStart)
                    m.hookForEventStart(oldGuildScheduledEvent, newGuildScheduledEvent);
            });
        }
    }
);

// Listen for PresenceUpdate, update games played and forward to all modules if someone started playing a game
client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (newPresence.member.user.bot) return;

    newPresence.activities.forEach(async (newActivity) => {
        if (newActivity.type === ActivityType.Playing) {
            // Check if user started playing....
            let justStarted = true;
            // If the activity is already in the old state, they did not start.
            oldPresence?.activities.forEach((oldActivity) => {
                if (oldActivity.name === newActivity.name) justStarted = false;
            });

            if (justStarted) {
                console.log(
                    `${newPresence.member.displayName} starts playing ${newActivity.name}.`
                );
                let [game, gameCreated] = await client.db.Game.findOrCreate({
                    where: { name: newActivity.name },
                });

                let [gamePlayed, gamePlayedCreated] = await client.db.GameStatus.findOrCreate({
                    where: {
                        GameId: game.id,
                        member: newPresence.member.id,
                    },
                    defaults: { lastplayed: newActivity.createdTimestamp },
                });

                if (gamePlayedCreated == false) {
                    await gamePlayed.update({
                        lastplayed: newActivity.createdTimestamp,
                    });
                }

                ronja_modules.forEach((m) => {
                    if (m.hookForStartedPlaying)
                        m.hookForStartedPlaying(oldPresence, newPresence, newActivity, game);
                });
            }
        }
    });
});

// client.on(Events.Debug, console.debug);
client.on(Events.Warn, console.warn);
client.on(Events.Error, console.error);

client.login(process.env.RONJA_TOKEN);
