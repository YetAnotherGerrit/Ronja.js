// Discord-specific dependencies
const { Ronja } = require('./ronja_modules/Ronja.js');
const { GatewayIntentBits, Events, ActivityType, GuildScheduledEventStatus } = require('discord.js');

// Cron-module
const cron = require('node-cron');

// Load Ronja's modular system
const ronja_modules = [];

// ronja_modules.push(require('./ronja_modules/AmazonGamesServerStatus.js'));
ronja_modules.push(require('./ronja_modules/DynamicTextChannels.js'));
ronja_modules.push(require('./ronja_modules/DynamicVoiceChannels.js'));
ronja_modules.push(require('./ronja_modules/NWDB.js'));
ronja_modules.push(require('./ronja_modules/ReoccurringEvents.js'));
ronja_modules.push(require('./ronja_modules/Serverprofil.js'));
ronja_modules.push(require('./ronja_modules/Top10.js'));
ronja_modules.push(require('./ronja_modules/Zocken.js'));

// Timezone TODO: move to config
const myTimezone = 'Europe/Berlin';

const client = new Ronja({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildScheduledEvents] });


client.once('ready', () => {
	client.myReady();

	ronja_modules.forEach(m => {
		if (m.init) m.init(client);
	});

	ronja_modules.forEach(m => {
		if (m.hookForCron) {
			m.hookForCron().forEach(mc => {
				if (!cron.validate(mc.schedule)) console.error(`ERROR: ${mc.schedule} is not a valid cron pattern.`);
				cron.schedule(mc.schedule, mc.action, {timezone: myTimezone});
			});
		};
	});

	console.log('Ready!');
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isCommand() && !interaction.isContextMenuCommand() && !interaction.isButton()) return;
	console.log(`${interaction.member.displayName} used commandName ${interaction.commandName}.`)

	ronja_modules.forEach(m => {
		if (m.hookForInteraction) m.hookForInteraction(interaction);
	});
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {

	ronja_modules.forEach(m => {
		if (m.hookForVoiceUpdate) m.hookForVoiceUpdate(oldState, newState);
	});
});

client.on(Events.GuildScheduledEventUpdate, async (oldGuildScheduledEvent, newGuildScheduledEvent) => {

	ronja_modules.forEach(m => {
		if (m.hookForEventUpdate) m.hookForEventUpdate(oldGuildScheduledEvent, newGuildScheduledEvent);
	});

	if (newGuildScheduledEvent.status == GuildScheduledEventStatus.Active && oldGuildScheduledEvent.status != GuildScheduledEventStatus.Active) {
		ronja_modules.forEach(m => {
			if (m.hookForEventStart) m.hookForEventStart(oldGuildScheduledEvent, newGuildScheduledEvent);
		});
	};

});


client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
	if (newPresence.member.user.bot) return;

	newPresence.activities.forEach(async newActivity => {
		if (newActivity.type === ActivityType.Playing) {
			let justStarted = true;
			oldPresence?.activities.forEach(oldActivity => {
				if (oldActivity.name === newActivity.name) justStarted = false;
			});

			if (justStarted) {
				console.log(`${newPresence.member.displayName} starts playing ${newActivity.name}.`);
				let [game,gameCreated] = await client.myDB.Games.findOrCreate({
					where: {name: newActivity.name},
				});
				
				let [gamePlayed,gamePlayedCreated] = await client.myDB.GamesPlayed.findOrCreate({
					where: {GameId: game.id, member: newPresence.member.id},
					defaults: {lastplayed: newActivity.createdTimestamp},
				});

				if (gamePlayedCreated == false) {
					await gamePlayed.update({lastplayed: newActivity.createdTimestamp});
				};

				ronja_modules.forEach(m => {
					if (m.hookForStartedPlaying) m.hookForStartedPlaying(oldPresence, newPresence, newActivity, game);
				});					
			}
		}
	});
 
});

// client.on('debug', console.debug);
client.on('warn', console.warn);
client.on('error', console.error);

client.login(client.myConfig.token);