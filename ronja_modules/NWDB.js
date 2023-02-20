const axios = require('axios');

const myNWDB = {
    defaultConfig: {
        newWorldChannel: null,
        newWorldServer: null,

        newWorldCronPattern: '*/5 * * * *',
    },

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
            resultString = getServer + ": " + serverPlayers + this.l(" active players");
        }
        else {
            resultString = getServer + ": " + serverStatus + " (" + serverPlayers + "/" + serverLimit + ")";
        }

        if (serverQueue > 0) {
            resultString = resultString + this.l(', %s in the queue', serverQueue);
        }

        resultString = resultString;
    
        return resultString;
    },

    hookForCron: function() {
        return [
            {
                schedule: this.cfg.newWorldCronPattern,
                action: () => {
                    if (this.cfg.newWorldChannel && this.cfg.newWorldServer) {
                        this.client.channels.fetch(this.cfg.newWorldChannel)
                        .then(c => {
                            this.myGetServerStatus(this.cfg.newWorldServer)
                            .then(res => {
                                if (res != '') {
                                    c.setTopic(res);
                                }
                            })
                            .catch(console.error);
                        })
                        .catch(console.error);
                    } else {
                        console.warn('WARNING: newWorldServer and newWorldServer need to be set in config file!')
                    }
                },
            }
        ];
    },
};

module.exports = myNWDB;