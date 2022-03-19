const { Client, Intents, MessageEmbed } = require('discord.js');
const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const SECRET = require('./_SECRET/config.js');

const ronja_modules = [];

ronja_modules.push(require('./ronja_modules/AmazonGamesServerStatus.js'));
ronja_modules.push(require('./ronja_modules/Zocken.js'));
ronja_modules.push(require('./ronja_modules/Top10.js'));


const cMinimumPlayers = 3;

const datetimeoptions = { year: 'numeric', month: '2-digit', day: '2-digit' };

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_PRESENCES]});

const cron = require('node-cron');
const { Model } = require('sequelize');

const seq = new Sequelize('database', 'user', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	// SQLite only:
	storage: '_SECRET/database.sqlite',
});

const db = {
	Games: seq.define('Games', {
		name: {
			type: Sequelize.STRING,
			unique: true,
		},
		channel: {
			type: Sequelize.STRING,
			defaultValue: null,
			allowNull: true,
		}, 
	}),

	GamesPlayed: seq.define('GamesPlayed', {
		member: Sequelize.STRING,
		lastplayed: Sequelize.DATE,
	}),

	Member: seq.define('Member', {
		zockenmention: {
			type: Sequelize.TINYINT,
			defaultValue: 1,
		}
	}),
};

db.Games.hasMany(db.GamesPlayed);
db.GamesPlayed.belongsTo(db.Games);

function setGameAsChannelName(ch) {
	if (ch.isVoice() && ch.userLimit === 0) {
		let Spiele = {};
		let MaxSpiel = null;
		let CountSpiel = 0;

		ch.members.forEach(m => {
			if (m.presence) m.presence.activities.forEach(a => {
				if (a.type === 'PLAYING') Spiele[a.name] = (Spiele[a.name] || 0) + 1;
			});
		});
		Object.entries(Spiele).forEach(e => {
			let [key, value] = e;
			if (value > CountSpiel) {
				CountSpiel = value;
				MaxSpiel = key;
			}
		})
		ch.setName(MaxSpiel || 'Ei Gude!');
	}
}


client.once('ready', () => {
	db.Games.sync();
	db.GamesPlayed.sync();
	db.Member.sync();

	ronja_modules.forEach(m => {
		if (m.init) m.init(client, db);
	});

	ronja_modules.forEach(m => {
		if (m.hookForCron) {
			m.hookForCron().forEach(mc => {
				if (!cron.validate(mc.schedule)) console.error(`ERROR: ${mc.schedule} is not a valid cron pattern.`);
				cron.schedule(mc.schedule, mc.action, {timezone: 'Europe/Berlin'});
			});
		};
	});

	console.log('Ready!');
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand() && !interaction.isContextMenu() && !interaction.isButton()) return;
	console.log(`${interaction.member.displayName} nutzt den Befehl ${interaction.commandName}.`)

	ronja_modules.forEach(m => {
		if (m.hookForInteraction) m.hookForInteraction(interaction);
	});

	let e = new MessageEmbed();
	switch(interaction.commandName) {

		case('Serverprofil'):
			let m = await interaction.guild.members.fetch(interaction.options.getUser('user').id);
			e.setColor('BLUE')
			.setTitle(`Profil von ${m.displayName}`)
			.setThumbnail(m.displayAvatarURL())
			.setDescription(`${m.displayName} ist seit dem ${m.joinedAt.toLocaleDateString('de-DE', datetimeoptions)} auf diesem Discordserver.`);

			if (interaction.member != m) {
				let s = '';
				let g = await db.Games.findAll({
					raw: true,
					attributes: [
						'name',
						[Sequelize.fn('COUNT', '*'),'cName']
					],
					include: [
						{
							model: db.GamesPlayed,
							where: {
								member: [interaction.member.id,m.id]
							}
			
						}
					],
					order: [
						[Sequelize.fn('count', Sequelize.col('*')),'DESC'],
						['name', 'ASC'],
					
					],
					group: 'Games.name',
				});
	
				g.forEach(gg => {
					if (gg.cName === 2) {
						s = s.concat(gg.name,'\n');
					}
				});

				if (s != '') {
				 	e.addField('Gemeinsame Spiele',s);
				 };
			};

			await interaction.reply({
				embeds: [ e	],
				ephemeral: true,
			});
			break;
	}
});

client.on('voiceStateUpdate', async (oldState, newState) => {
   if (newState.channel && newState.channel.userLimit === 1) {
		let newChannel = await newState.channel.parent.createChannel(`Kanal von ${newState.member.displayName}`,{type: 'GUILD_VOICE', bitrate: 128000});
		newChannel.lockPermissions();
		await newState.setChannel(newChannel);
   } 

   if (oldState.channel && oldState.channel != newState.channel && oldState.channel.isVoice() && oldState.channel.userLimit === 0 && oldState.channel.members.size === 0) {
	   await oldState.channel.delete();
   }

   if (oldState.channel && oldState.channel != newState.channel && oldState.channel.userLimit === 0 && oldState.channel.members.size > 0) await setGameAsChannelName(oldState.channel);
   if (newState.channel && oldState.channel != newState.channel && newState.channel.userLimit === 0 && newState.channel.members.size > 0) await setGameAsChannelName(newState.channel);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
	if (newPresence.member.user.bot) return;

	newPresence.activities.forEach(async newActivity => {
		if (newActivity.type === 'PLAYING') {
			let justStarted = true;
			oldPresence.activities.forEach(oldActivity => {
				if (oldActivity.name === newActivity.name) justStarted = false;
			});

			if (justStarted) {
				console.log(`${newPresence.member.displayName} spielt ${newActivity.name}.`);
				let [game,gameCreated] = await db.Games.findOrCreate({
					where: {name: newActivity.name},
				});
				
				let [gamePlayed,gamePlayedCreated] = await db.GamesPlayed.findOrCreate({
					where: {GameId: game.id, member: newPresence.member.id},
					defaults: {lastplayed: newActivity.createdTimestamp},
				});
				if (gamePlayedCreated == false) {
					await gamePlayed.update({lastplayed: newActivity.createdTimestamp});
				};
				
				if (gameCreated == false) {
					if (game.channel) {
						let gameChannel = await client.channels.fetch(game.channel);
						gameChannel.permissionOverwrites.create(newPresence.member.user,{'VIEW_CHANNEL': true});
					} else {
						let players  = await db.GamesPlayed.findAndCountAll({
							where: {GameId: game.id},
						});

						if (players.count >= cMinimumPlayers) {
							let autoChannel = await client.channels.fetch(SECRET.AktiveSpieleKategorie)
							let newChannel = await autoChannel.createChannel(newActivity.name,{
								type: 'GUILD_TEXT',
								permissionOverwrites: [
									{
										id: newPresence.guild.roles.everyone,
										deny: ['VIEW_CHANNEL'],
									},
									{
										id: newPresence.guild.me,
										allow: ['VIEW_CHANNEL'],
									},
								],										
							});
							players.rows.forEach(async player => {
								let player_member = await newPresence.guild.members.fetch(player.member);
								newChannel.permissionOverwrites.create(player_member,{'VIEW_CHANNEL': true});
							});
							game.update({channel: newChannel.id});
						};
					};
				};
				if (newPresence.member.voice.channel) await setGameAsChannelName(newPresence.member.voice.channel);
			}
		}
	});
 
});

client.login(SECRET.token);