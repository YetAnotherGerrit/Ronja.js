const mySecret = {
	clientId: "xxxxxxxxxxxxxxxxxx",
	guildId: "xxxxxxxxxxxxxxxxxx",
	token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

    // DynamicTextChannels
    dtcGamesCategory: '',           // ID of channel category, where the game specific text channels should be created in
    dtcArchivedGamesCategory: '',   // ID of channel category, where archived text channels should be moved to

    // NWDB - New World Database
    newWorldChannel: '',            // ID of New World channel
    newWorldServer: '',             // Name of New World server

    // Top10
    top10CronKanal: '',             // ID of channel where to regularly post Top10 rankings
}

module.exports = mySecret;
