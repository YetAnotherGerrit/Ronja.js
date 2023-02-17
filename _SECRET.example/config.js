const mySecret = {
	clientId: "xxxxxxxxxxxxxxxxxx",
	guildId: "xxxxxxxxxxxxxxxxxx",
	token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",

    // Kategorie, in der Spiele-Kanäle erstellt werden:
    AktiveSpieleKategorie: 'xxxxxxxxxxxxxxxxxx',
    // Kategorie, in die Spiele-Kanäle verschoben werden, wenn die Spiele nicht mehr gespielt werden:
    ArchivSpieleKategorie: 'xxxxxxxxxxxxxxxxxx',

    // Kanal in dem Top der Woche/Monats/Jahr gepostet werden:
    CronKanal: 'xxxxxxxxxxxxxxxxxx',

    // Update-Status von AGS-Spielen:
    LostArkKanal: 'xxxxxxxxxxxxxxxxxx', // TODO: Aus Datenbank holen
    NewWorldKanal: 'xxxxxxxxxxxxxxxxxx', // TODO: Aus Datenbank holen

    AgsCronPattern: '*/5 * * * *',
    LostArkServer: 'xxx',
    NewWorldServer: 'xxx',

    VoiceBitrate: '96000', // Bitrate for voice channels created by ronja. Max without Nitro is 96000.
}

module.exports = mySecret;