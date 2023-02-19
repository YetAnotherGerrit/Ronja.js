const mySecret = {
	clientId: "xxxxxxxxxxxxxxxxxx",  // https://discord.com/developers/applications
	guildId: "xxxxxxxxxxxxxxxxxx",   // Create application in dev portal to get ((clientId)), it's called "Application ID" there
                                     // Create bot within this application to get ((token))
                                     // Get ((guildId)) by right clicking on your server and choosing "Copy ID" (need to have dev mode enabled)
	token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

    // DynamicTextChannels
    dtcGamesCategory: '',           // ID of channel category, where the game specific text channels should be created in
    dtcArchivedGamesCategory: '',   // ID of channel category, where archived text channels should be moved to
    dtcNotificationChannel: '',     // ID of channel, where to post notification about channel creation (optional)

    // NWDB - New World Database
    newWorldChannel: '',            // ID of New World channel
    newWorldServer: '',             // Name of New World server

    // Top10
    top10CronKanal: '',             // ID of channel where to regularly post Top10 rankings
}

module.exports = mySecret;
