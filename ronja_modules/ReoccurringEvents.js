const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const Moment = require('moment');

const myReoccurringEvents = {
    hookForEventStart: async function(oldGuildScheduledEvent, newGuildScheduledEvent)  {
        let myReg = /\[w(\d+)\]/;
        let myRegResult = myReg.exec(newGuildScheduledEvent.description);
        let pDays = null;

        if (myRegResult) {
            pDays = myRegResult[1] * 7;

            newGuildScheduledEvent.guild.scheduledEvents.create({
                name: newGuildScheduledEvent.name,
                scheduledStartTime: Moment(newGuildScheduledEvent.scheduledStartTimestamp).add(pDays,'days'),
                scheduledEndTime: newGuildScheduledEvent.scheduledEndTimestamp ? Moment(newGuildScheduledEvent.scheduledEndTimestamp).add(pDays,'days') : newGuildScheduledEvent.scheduledEndTimestamp, // Optional, but not for EXTERNAL
                privacyLevel: newGuildScheduledEvent.privacyLevel,
                entityType: newGuildScheduledEvent.entityType,
                description: newGuildScheduledEvent.description, // Optional
                channel: newGuildScheduledEvent.channel, // Optional, but not for STAGE_INSTANCE or VOICE
                entityMetadata: newGuildScheduledEvent.entityMetadata, // Optional, but not for EXTERNAL,
                reason: 'Reoccurring Event', // Optional
            });
        };
    },
};

module.exports = myReoccurringEvents;