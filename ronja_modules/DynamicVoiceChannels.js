const myDynamicVoiceChannels = {
    client: null,

    init: function(client) {this.client = client},

    setGameAsChannelName: async function(ch) {
        // Only set for Voice-Channels without UserLimit
        if (ch.isVoice() && ch.userLimit === 0) {
            let Spiele = {};
            let MaxSpiel = null;
            let CountSpiel = 0;
    
            await Promise.all(ch.members.map(async (m) => {
                if (m.presence) m.presence.activities.forEach(a => {
                    if (a.type === 'PLAYING') Spiele[a.name] = (Spiele[a.name] || 0) + 1;
                });
            }));

            Object.entries(Spiele).forEach(e => {
                let [key, value] = e;
                if (value > CountSpiel) {
                    CountSpiel = value;
                    MaxSpiel = key;
                }
            });

            if (MaxSpiel) ch.setName(MaxSpiel);
        };
    },


    hookForVoiceUpdate: async function(oldState, newState) {
        if (newState.channel && newState.channel.userLimit === 1) {
            let newChannel = await newState.channel.parent.createChannel(`Kanal von ${newState.member.displayName}`,{type: 'GUILD_VOICE', bitrate: 128000});
            newChannel.lockPermissions();
            await newState.setChannel(newChannel);
       } 
    
       if (oldState.channel && oldState.channel != newState.channel && oldState.channel.isVoice() && oldState.channel.userLimit === 0 && oldState.channel.members.size === 0) {
           await oldState.channel.delete();
       }
    
       if (oldState.channel && oldState.channel != newState.channel && oldState.channel.userLimit === 0 && oldState.channel.members.size > 0) await this.setGameAsChannelName(oldState.channel);
       if (newState.channel && oldState.channel != newState.channel && newState.channel.userLimit === 0 && newState.channel.members.size > 0) await this.setGameAsChannelName(newState.channel);
    },


};

module.exports = myDynamicVoiceChannels;