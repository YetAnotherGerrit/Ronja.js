const { ActionRowBuilder, ButtonStyle, ComponentType } = require("discord.js");

// The "Show to channel" button under ephemeral replies that are worth sharing
// (not personal settings, not admin-only commands). ronja_modules/Share.js
// handles its clicks.
const SHARE_BUTTON_ID = "shareReply";
const BUTTONS_PER_ROW = 5; // Discord's limit for buttons in one row.

function shareButton(client, locale) {
    return client
        .myButton("📢")
        .setCustomId(SHARE_BUTTON_ID)
        .setLabel(client.myTranslator(locale, "Show to channel"))
        .setStyle(ButtonStyle.Secondary);
}

// `rows` (action row builders, as a reply's `components`) with the share
// button at the end: in the last row if that's a button row with room left,
// else in a row of its own.
function withShareButton(client, locale, rows = []) {
    let button = shareButton(client, locale);
    let last = rows[rows.length - 1];
    let buttonRow =
        last &&
        last.components.length < BUTTONS_PER_ROW &&
        last.components.every((c) => c.data.type === ComponentType.Button);
    if (buttonRow) {
        return [
            ...rows.slice(0, -1),
            new ActionRowBuilder().addComponents(...last.components, button),
        ];
    }
    return [...rows, new ActionRowBuilder().addComponents(button)];
}

module.exports = { SHARE_BUTTON_ID, withShareButton };
