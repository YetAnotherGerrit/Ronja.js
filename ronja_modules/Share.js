const { EmbedBuilder, Colors, MessageFlags, TimestampStyles, time } = require("discord.js");
const { SHARE_BUTTON_ID } = require("../core/share.js");

// Replies older than this say when they were created, so nobody mistakes a
// month-old /top10 for today's.
const SHOW_AGE_AFTER_MS = 10 * 60 * 1000;

// The share button's clicks (see core/share.js): posts the ephemeral reply's
// embeds to its channel for everyone, naming who shared it, and deletes the
// ephemeral reply - an ephemeral message can't be made visible, only replaced.
// Only the embeds go along: the reply's other buttons (like /gameinfo's
// Join/Leave) depend on who looks at them.
const myShare = {
    hookForButtonInteraction: async function (interaction) {
        if (interaction.customId !== SHARE_BUTTON_ID) return;
        let locale = interaction.locale;
        let member = interaction.member.toString();
        let created = interaction.message.createdAt;
        let content =
            Date.now() - created.getTime() > SHOW_AGE_AFTER_MS
                ? this.l(
                      locale,
                      "%s shared this (created %s):",
                      member,
                      time(created, TimestampStyles.RelativeTime)
                  )
                : this.l(locale, "%s shared this:", member);

        await interaction.deferUpdate();
        try {
            await interaction.followUp({
                content,
                embeds: interaction.message.embeds,
                allowedMentions: { parse: [] },
            });
        } catch (err) {
            // The ephemeral reply stays, so it can be shared again.
            console.error("Share: could not share a reply:", err);
            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setDescription(
                            this.l(locale, "Sorry, I couldn't show this to the channel.")
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        try {
            await interaction.deleteReply();
        } catch (err) {
            console.error("Share: could not delete the shared ephemeral reply:", err);
        }
    },
};

module.exports = myShare;
