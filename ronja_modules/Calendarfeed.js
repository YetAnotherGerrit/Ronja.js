const iCal = require('ical-generator');
const jsftp = require("jsftp");

const myICalFeed = {
    defaultConfig: {
        icalFtpServer: '',
        icalFtpPort: '',
        icalFtpUsername: '',
        icalFtpPassword: '',
        icalUrl: '',
    },

    updateICalFile: async function(guild, user) {
        let scheduledEvents = await guild.scheduledEvents.fetch({cache: true})
        let iCalendar = new iCal({name: 'Discord Events'});


        let myFtp = new jsftp({
            host: this.cfg.icalFtpServer,
            port: this.cfg.icalFtpPort || 21,
            user: this.cfg.icalFtpUsername,
            pass: this.cfg.icalFtpPassword
          });
        

        await Promise.all(scheduledEvents.map(async (guildEvent) => {
            let eventSubcribers = await guildEvent.fetchSubscribers();
            let myRepeating;
            let myReg = /\[w(\d+)\]/;
            let myRegResult = myReg.exec(guildEvent.description);
    
            if (myRegResult) {
                myRepeating = {
                    freq: 'WEEKLY',
                    interval: myRegResult[1],
                }
            }

            await Promise.all(eventSubcribers.map(async (eventSubcriber) => {
                if (eventSubcriber.user.id == user.id) {

                    iCalendar.createEvent({
                        start: guildEvent.scheduledStartAt,
                        end: guildEvent.scheduledEndAt,
                        summary: 'Discord: ' + guildEvent.name,
                        description: guildEvent.description + "\n" + guildEvent.entityMetadata.location + "\n" + guildEvent.url,
                        repeating: myRepeating
                    });

                }

            }));

            
        }))

        let buff = Buffer.from(iCalendar.toString(), "utf-8");

        await myFtp.put(buff, user.id+'.ics', err => {
            if (err) {
              console.error(err)
            }
        });

    },

    hookForCommandInteraction: async function(interaction)  {
		if (interaction.commandName == 'ical') {
            await interaction.deferReply({ephemeral: true});

            if (this.cfg.icalFtpServer && this.cfg.icalFtpUsername && this.cfg.icalFtpPassword && this.cfg.icalUrl) {
                await this.updateICalFile(interaction.guild, interaction.user);
                interaction.editReply({content: this.cfg.icalUrl + interaction.user.id + '.ics'})
            } else {
                interaction.editReply({content: this.l(interaction.locale,'The ical-settings for this server are incomplete.')});
            }
        };
    },

    hookForEventUserUpdate: async function(oGuildScheduledEvent, oUser)  {
        if (this.cfg.icalFtpServer && this.cfg.icalFtpUsername && this.cfg.icalFtpPassword && this.cfg.icalUrl)
            this.updateICalFile(oGuildScheduledEvent.guild, oUser);
    },


};

module.exports = myICalFeed;