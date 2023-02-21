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
            resultString = getServer + ": " + this.l(serverStatus) + " (" + serverPlayers + "/" + serverLimit + ")";
        }

        if (serverQueue > 0) {
            resultString = resultString + this.l(', %s in the queue', serverQueue);
        }

        resultString = resultString;
    
        return resultString;
    },

    hookForCron: function() {
        if (!this.cfg.newWorldChannel || !this.cfg.newWorldServer) {
            console.info('INFO: newWorldChannel or newWorldServer not set in config file, disabling New-World queries!');
            return [];
        }
        return [
            {
                schedule: this.cfg.newWorldCronPattern,
                action: () => {
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
                },
            }
        ];
    },
};

module.exports = myNWDB;