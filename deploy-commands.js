const { SlashCommandBuilder, REST, Routes } = require('discord.js');

const { clientId, guildId, token } = require('./_SECRET/config.js');

const commands = [
	new SlashCommandBuilder()
		.setName('top10')
		.setDescription('List the top 10 games by player count.').setDescriptionLocalizations({de: 'Zeigt die Top 10-Spiele nach Anzahl von Mitspielern.'})
		.addIntegerOption(option => option
			.setName('days').setNameLocalizations({de: 'tage'})
			.setDescription('Top 10 for what period?').setDescriptionLocalizations({de: 'Top 10 für welchen Zeitraum?'})
			.setRequired(false)
		)
	,
	new SlashCommandBuilder()
		.setName('serverprofile').setNameLocalizations({de: 'serverprofil'})
		.setDescription('USER')
	,
	new SlashCommandBuilder()
		.setName('lfg').setNameLocalizations({de: 'zocken'})
		.setDescription('You want to game and need fellow gamers?').setDescriptionLocalizations({de: 'Du willst was zocken und suchst Mitspieler?'})
		.addStringOption(option => option
			.setName('day').setNameLocalizations({de: 'tag'})
			.setDescription('Select the day you want to play.').setDescriptionLocalizations({de: 'Wähle den Tag an dem du zocken möchtest.'})
			.setRequired(false)
			.addChoices(
				{ name: 'Today', value: 'today', name_localizations: {de: 'Heute'} },
				{ name: 'Tomorrow', value: 'tomorrow', name_localizations: {de: 'Morgen'} }
			)
		)
		.addStringOption(option => option
			.setName('time').setNameLocalizations({de: 'uhrzeit'})
			.setDescription('Select the time you want to play (HH:MM). Use 24h time format.').setDescriptionLocalizations({de: 'Setze die Uhrzeit zu der du spielen möchtest (SS:MM).'})
			.setRequired(false)			
		)
		.addStringOption(option => option
			.setName('title').setNameLocalizations({de: 'titel'})
			.setDescription('Give your gaming session a name.').setDescriptionLocalizations({de: 'Gib deinem /zocken-Aufruf einen Namen.'})
			.setRequired(false)			
		)
	,
]
.map(command => command.toJSON());

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

commands.forEach(cmd => {
	if (cmd.description == 'USER') {
		cmd.type = 2;
		cmd.name = capitalizeFirstLetter(cmd.name);
		cmd.name_localizations.de = capitalizeFirstLetter(cmd.name_localizations.de)
		delete cmd.description;
	}
	if (cmd.description == 'MESSAGE') {
		cmd.type = 3;
		cmd.name = capitalizeFirstLetter(cmd.name);
		cmd.name_localizations.de = capitalizeFirstLetter(cmd.name_localizations.de)
		delete cmd.description;
	}
});

console.log(commands);

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);
