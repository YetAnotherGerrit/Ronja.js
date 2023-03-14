const Sequelize = require('sequelize');
const Op = Sequelize.Op;
const { DateTime } = require("luxon");

const myReoccurringEvents = {
    hookForEventStart: async function(oldGuildScheduledEvent, newGuildScheduledEvent)  {
        let myReg = /\[w(\d+)\]/;
        let myRegResult = myReg.exec(newGuildScheduledEvent.description);
        let pDays = null;

        if (myRegResult) {
            pDays = myRegResult[1] * 7;

            newGuildScheduledEvent.guild.scheduledEvents.create({
                name: newGuildScheduledEvent.name,
                scheduledStartTime: DateTime.fromJSDate(newGuildScheduledEvent.scheduledStartAt).plus({days: pDays}).toJSDate(),
                scheduledEndTime: newGuildScheduledEvent.scheduledEndTimestamp ? DateTime.fromJSDate(newGuildScheduledEvent.scheduledEndAt).plus({days: pDays}).toJSDate() : newGuildScheduledEvent.scheduledEndTimestamp, // Optional, but not for EXTERNAL
                privacyLevel: newGuildScheduledEvent.privacyLevel,
                entityType: newGuildScheduledEvent.entityType,
                description: newGuildScheduledEvent.description, // Optional
                channel: newGuildScheduledEvent.channel, // Optional, but not for STAGE_INSTANCE or VOICE
                entityMetadata: newGuildScheduledEvent.entityMetadata, // Optional, but not for EXTERNAL,
                image: newGuildScheduledEvent.coverImageURL() ? newGuildScheduledEvent.coverImageURL()+'?size=1024' : null, // Optional
                reason: 'Reoccurring Event', // Optional
            });
        };
    },
};

module.exports = myReoccurringEvents;