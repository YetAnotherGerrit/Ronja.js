const { MessageEmbed } = require('discord.js');

const axios = require('axios');
const html = require('node-html-parser');

const myAmazonGamesServerStatus = {
    client: null,
    
    dbLostArkStatus: 'Init',
    dbNewWorldStatus: 'Init',

    init: function(client) {this.client = client},

    myGetServerStatus: async function(getGame, getServer) {
        let url = '';
        let c = 'RED';
        let r = 'Unbekannt';
        switch(getGame) {
            case('New World'):
                url = 'https://www.newworld.com/en-us/support/server-status';
                break;
            case('Lost Ark'):
                url = 'https://www.playlostark.com/en-us/support/server-status';
                break;
        };
    
        if (url) {
            let res = await axios.get(url);
            let root = html.parse(res.data);
            root.querySelectorAll('.ags-ServerStatus-content-responses-response-server').forEach(server => {
                if (server.querySelector('.ags-ServerStatus-content-responses-response-server-name').textContent.trim() === getServer) {
                    if (server.toString().includes('--good')) {r = 'Gut'};
                    if (server.toString().includes('--busy')) {r = 'Ausgelastet'};
                    if (server.toString().includes('--full')) {r = 'Voll'};
                    if (server.toString().includes('--maintenance')) {r = 'Wartung'};
                    if (server.toString().includes('--up')) {r = 'Online'};
                    if (server.toString().includes('--down')) {r = 'Offline'};
                    if (server.toString().includes('--noTransfer')) {r = 'Charakterübertragung ist nicht verfügbar'};
                };
            });
        };
    
        switch(r) {
            case('Gut'):
                c = 'GREEN';
                break;
            case('Ausgelastet'):
                c = 'YELLOW';
                break;
            case('Voll'):
                c = 'RED';
                break;
            case('Wartung'):
                c = 'BLUE';
                break;
            case('Online'):
                c = 'GREEN';
                break;
            case('Offline'):
                c = 'RED';
                break;
            case('Charakterübertragung ist nicht verfügbar'):
                c = 'GREY';
                break;
            default:
                c = 'GREY';
        };
        return [c,r];
    },

    hookForCron: function() {
        return [
            {
                schedule: this.client.myConfig.AgsCronPattern,
                action: () => {
                    this.client.channels.fetch(this.client.myConfig.LostArkKanal)
                    .then(c => {
                        this.myGetServerStatus('Lost Ark',this.client.myConfig.LostArkServer)
                        .then(res => {
                            if (this.dbLostArkStatus != res[1]) {
                                if (this.dbLostArkStatus != 'Init') c.send({embeds: [new MessageEmbed().setTitle(`Serverstatus ${this.client.myConfig.LostArkServer}`).setColor(res[0]).setDescription(`Der Serverstatus von ${this.client.myConfig.LostArkServer} hat sich geändert: ${res[1]}.`)]});
                                this.dbLostArkStatus = res[1];
                            };
                        })
                        .catch(console.error);
                    })
                    .catch(console.error);
                    this.client.channels.fetch(this.client.myConfig.NewWorldKanal)
                    .then(c => {
                        this.myGetServerStatus('New World',this.client.myConfig.NewWorldServer)
                        .then(res => {
                            if (this.dbNewWorldStatus != res[1]) {
                                if (this.dbNewWorldStatus != 'Init') c.send({embeds: [new MessageEmbed().setTitle(`Serverstatus ${this.client.myConfig.NewWorldServer}`).setColor(res[0]).setDescription(`Der Serverstatus von ${this.client.myConfig.NewWorldServer} hat sich geändert: ${res[1]}.`)]});
                                this.dbNewWorldStatus = res[1];
                            };
                        })
                        .catch(console.error);
                    })
                    .catch(console.error);
                },
            }
        ];
    },
};

module.exports = myAmazonGamesServerStatus;