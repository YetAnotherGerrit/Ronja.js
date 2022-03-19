const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, guildId, token } = require('./config.json');

const commands = [
	new SlashCommandBuilder().setName('top10').setDescription('Zeigt die Top10-Spiele der Liga nach Anzahl von Mitspielern.')
		.addIntegerOption(option => option.setName('tage').setDescription('Top10 für welchen Zeitraum?').setRequired(false)),
	new SlashCommandBuilder().setName('serverprofil').setDescription('USER'),
	new SlashCommandBuilder().setName('zocken').setDescription('Du willst was zocken und suchst Mitspieler?'),
]
.map(command => command.toJSON());

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

commands.forEach(cmd => {
	if (cmd['description'] == 'USER') {
		cmd['type'] = 2;
		cmd['name'] = capitalizeFirstLetter(cmd['name']);
		delete cmd.description;
	}
	if (cmd['description'] == 'MESSAGE') {
		cmd['type'] = 3;
		cmd['name'] = capitalizeFirstLetter(cmd['name']);
		delete cmd.description;
	}
});

console.log(commands);

const rest = new REST({ version: '9' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);