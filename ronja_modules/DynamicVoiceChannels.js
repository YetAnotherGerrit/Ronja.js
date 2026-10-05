const { ChannelType, ActivityType } = require("discord.js");

const myDynamicVoiceChannels = {
    defaultConfig: {
        voiceChannelBitrate: 96000,
    },

    setGameAsChannelName: async function (channel) {
        // Only set for voice channels without a user limit
        if (channel.type !== ChannelType.GuildVoice || channel.userLimit !== 0) return;

        // How many of the channel's members are playing each game right now.
        let playerCounts = {};
        channel.members.forEach((member) => {
            member.presence?.activities.forEach((activity) => {
                if (activity.type !== ActivityType.Playing) return;
                const gameName = this.client.myResolveGameName(activity);
                if (gameName) playerCounts[gameName] = (playerCounts[gameName] || 0) + 1;
            });
        });

        // The game most members are playing.
        let mostPlayedGame = null;
        let mostPlayers = 0;
        for (const [gameName, players] of Object.entries(playerCounts)) {
            if (players > mostPlayers) {
                mostPlayers = players;
                mostPlayedGame = gameName;
            }
        }

        if (mostPlayedGame) channel.setName(mostPlayedGame);
    },

    hookForVoiceUpdate: async function (oldState, newState) {
        if (newState.channel && newState.channel.userLimit === 1) {
            let newChannel = await newState.channel.parent.children.create({
                name: `Kanal von ${newState.member.displayName}`,
                type: ChannelType.GuildVoice,
                bitrate: Number(this.cfg("voiceChannelBitrate")),
            });
            newChannel.lockPermissions();
            try {
                await newState.setChannel(newChannel);
            } catch {
                // if user cannot be moved to new channel, delete the newly created channel
                newChannel.delete();
            }
        }

        if (
            oldState.channel &&
            oldState.channel != newState.channel &&
            oldState.channel.type === ChannelType.GuildVoice &&
            oldState.channel.userLimit === 0 &&
            oldState.channel.members.size === 0
        ) {
            try {
                await oldState.channel.delete();
            } catch {
                // TODO: Add some error-protocoll handler.
                console.error(`[ERROR] Could not delete voice channel ${oldState.channel.name}.`);
            }
        }

        if (
            oldState.channel &&
            oldState.channel != newState.channel &&
            oldState.channel.userLimit === 0 &&
            oldState.channel.members.size > 0
        )
            await this.setGameAsChannelName(oldState.channel);
        if (
            newState.channel &&
            oldState.channel != newState.channel &&
            newState.channel.userLimit === 0 &&
            newState.channel.members.size > 0
        )
            await this.setGameAsChannelName(newState.channel);
    },

    hookForStartedPlaying: async function (oldPresence, newPresence, newActivity, gameCreated) {
        if (await newPresence.member.voice.channel)
            this.setGameAsChannelName(await newPresence.member.voice.channel);
    },
};

module.exports = myDynamicVoiceChannels;
