const mySecret = {
	clientId: "xxxxxxxxxxxxxxxxxx", // https://discord.com/developers/applications
	guildId: "xxxxxxxxxxxxxxxxxx",  // https://discordjs.guide/preparations/setting-up-a-bot-application.html
	token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

    language: 'en',                 // Set it to whatever tag you want to use. A template will be dynamically generated over time.

    // DynamicTextChannels
    dtcGamesCategory: '',           // ID of channel category, where the game specific text channels should be created in
    dtcArchivedGamesCategory: '',   // ID of channel category, where archived text channels should be moved to
    dtcNotificationChannel: '',     // ID of channel, where to post notification about channel creation (optional)

    // NWDB - New World Database
    newWorldChannel: '',            // ID of New World channel
    newWorldServer: '',             // Name of New World server

    // Top10
    top10CronKanal: '',             // ID of channel where to regularly post Top10 rankings
    top10Weekly: false,
    top10Monthly: false,
    top10Yearly: false,
}

module.exports = mySecret;
