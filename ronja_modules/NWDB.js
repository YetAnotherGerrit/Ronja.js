const axios = require('axios');

const myNWDB = {
    client: null,
    
    init: function(client) {this.client = client},

    myGetServerStatus: async function(getServer) {
        let url = 'https://nwdb.info/server-status';
        let regex = new RegExp(`\\[(\\d+),(\\d+),(\\d+),\\d+,\\\\\\"${getServer}\\\\\\",\\\\\\"Vanaheim Zeta\\\\\\",\\\\\\"eu-central-1\\\\\\",\\d+,\\\\\\"(\\w+)`);

        let response = await axios.get(url, {
            headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        let result = response.data.match(regex);
    
        let serverLimit = result[1];
        let serverPlayers = result[2];
        let serverQueue = result[3];
        let serverStatus = result[4];
        let resultString;
        
        if (serverStatus == 'ACTIVE') {
            resultString = getServer + ": " + serverPlayers + " aktive Spieler";
        }
        else {
            resultString = getServer + ": " + serverStatus + " (" + serverPlayers + "/" + serverLimit + ")";
        }

        if (serverQueue > 0) {
            resultString = resultString + `, ${serverQueue} in der Warteschlange`;
        }

        resultString = resultString + " | Fraktion: Syndikat";
    
        return resultString;
    },

    hookForCron: function() {
        return [
            {
                schedule: this.client.myConfig.AgsCronPattern,
                action: () => {
                    this.client.channels.fetch(this.client.myConfig.NewWorldKanal)
                    .then(c => {
                        this.myGetServerStatus(this.client.myConfig.NewWorldServer)
                        .then(res => {
                            if (res != '') {
                                c.setTopic(res);
                            }
                        })
                        .catch(console.error);
                    })
                    .catch(console.error);
                },
            }
        ];
    },
};

module.exports = myNWDB;