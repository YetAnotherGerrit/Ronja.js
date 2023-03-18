const { ChannelType, ActivityType } = require("discord.js");

const myDynamicVoiceChannels = {
    defaultConfig: {
        voiceChannelBitrate: 96000,
    },

    setGameAsChannelName: async function(ch) {
        // Only set for Voice-Channels without UserLimit
        if (ch.type === ChannelType.GuildVoice && ch.userLimit === 0) {
            let Spiele = {};
            let MaxSpiel = null;
            let CountSpiel = 0;
    
            await Promise.all(ch.members.map(async (m) => {
                if (m.presence) m.presence.activities.forEach(a => {
                    if (a.type === ActivityType.Playing) Spiele[a.name] = (Spiele[a.name] || 0) + 1;
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
            let newChannel =
                await newState.channel.parent.children.create({
                    name: `Kanal von ${newState.member.displayName}`,
                    type: ChannelType.GuildVoice,
                    bitrate: this.cfg.voiceChannelBitrate,
                });
            newChannel.lockPermissions();
            try {
                await newState.setChannel(newChannel);
            } catch { // if user cannot be moved to new channel, delete the newly created channel
                newChannel.delete();
            }
       } 
    
       if (oldState.channel && oldState.channel != newState.channel && oldState.channel.type === ChannelType.GuildVoice && oldState.channel.userLimit === 0 && oldState.channel.members.size === 0) {
           await oldState.channel.delete();
       }
    
       if (oldState.channel && oldState.channel != newState.channel && oldState.channel.userLimit === 0 && oldState.channel.members.size > 0) await this.setGameAsChannelName(oldState.channel);
       if (newState.channel && oldState.channel != newState.channel && newState.channel.userLimit === 0 && newState.channel.members.size > 0) await this.setGameAsChannelName(newState.channel);
    },

    hookForStartedPlaying: async function(oldPresence, newPresence, newActivity, gameCreated)  {
        if (await newPresence.member.voice.channel) this.setGameAsChannelName(await newPresence.member.voice.channel);
    },

};

module.exports = myDynamicVoiceChannels;