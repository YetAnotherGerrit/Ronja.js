const {
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    MessageFlags,
    TimestampStyles,
    escapeMarkdown,
    time,
} = require("discord.js");
const { truncate } = require("../core/gameCard.js");

const NEWS_SHOWN = 3;
const EXCERPT_LENGTH = 300;
const TITLE_LENGTH = 256; // Discord's limit for a field name.
const STEAM_TIMEOUT_MS = 10 * 1000;
// Only the developer's own announcements (patch notes etc.), no press articles.
const STEAM_NEWS_FEED = "steam_community_announcements";
// The BBCode tags Steam announcements use - anything else in brackets, like
// "[PC]" in patch notes, is text.
const BBCODE_TAG =
    /\[\/?(\*|b|i|u|s|strike|h[1-6]|url|img|list|olist|quote|code|spoiler|noparse|hr|table|tr|th|td|p|carousel|dynamiclink)(\b[^\]]*)?\]/gi;

// /news in a game's text channel: the game's latest Steam announcements and
// how many are playing it on Steam right now, for whoever asked. Its Steam
// app ID comes from IGDB (see steamAppId in ronja_modules/IGDB.js), so this
// only works for games matched to IGDB.
const mySteamNews = {
    commands: [
        new SlashCommandBuilder()
            .setName("news")
            .setDescription("Show this channel's game's latest Steam news and player count.")
            .setDescriptionLocalizations({
                de: "Zeigt die neuesten Steam-News und Spielerzahl zum Spiel dieses Kanals.",
            })
            .setDMPermission(false),
    ],

    hookForCommandInteraction: async function (interaction) {
        if (interaction.commandName !== "news") return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let locale = interaction.locale;

        let channel = interaction.channel?.isThread()
            ? interaction.channel.parentId
            : interaction.channelId;
        let game = await this.client.db.Game.findOne({ where: { channel } });
        if (!game) {
            await this.reply(
                interaction,
                Colors.Red,
                this.l(locale, "/news only works in a game's text channel.")
            );
            return;
        }

        let appId = (await this.client.myGameDetails(game))?.steamAppId;
        if (!appId) {
            await this.reply(
                interaction,
                Colors.Blue,
                this.l(locale, "No Steam news available for %s.", game.name)
            );
            return;
        }

        let news, players;
        try {
            [news, players] = await Promise.all([
                this.fetchNews(appId),
                this.fetchCurrentPlayers(appId),
            ]);
        } catch (err) {
            console.error(`Could not fetch Steam news for ${game.name} (app ${appId}):`, err);
            await this.reply(
                interaction,
                Colors.Red,
                this.l(locale, "Steam can't be reached right now, please try again later.")
            );
            return;
        }

        let e = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(this.l(locale, "News for %s", game.name))
            .setURL(`https://store.steampowered.com/news/app/${appId}`);
        let description = [];
        if (players !== null) {
            let count = new Intl.NumberFormat(locale).format(players);
            description.push(`👥 ${this.l(locale, "Playing on Steam right now: %s", count)}`);
        }
        if (!news.length) {
            description.push(this.l(locale, "No Steam news available for %s.", game.name));
        }
        if (description.length) e.setDescription(description.join("\n\n"));
        e.addFields(
            news.map((n) => ({
                name: truncate(n.title, TITLE_LENGTH),
                value: [
                    time(n.date, TimestampStyles.LongDate),
                    n.excerpt && escapeMarkdown(n.excerpt),
                    `[${this.l(locale, "Read more")}](${n.url})`,
                ]
                    .filter(Boolean)
                    .join("\n"),
            }))
        );

        await interaction.editReply({ embeds: [e] });
    },

    reply: async function (interaction, color, message) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(color).setDescription(message)],
        });
    },

    // The response of a Steam Web API request, or null if it answers with
    // `noDataStatus` - how it says it has no data for an app.
    steamRequest: async function (url, noDataStatus) {
        let res = await fetch(url, { signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
        if (res.status === noDataStatus) return null;
        if (!res.ok) throw new Error(`Steam request failed: ${res.status} ${res.statusText}`);
        return await res.json();
    },

    // The app's latest announcements as [{ title, date, excerpt, url }]. Steam
    // answers 403 for apps without (public) news.
    fetchNews: async function (appId) {
        let params = new URLSearchParams({
            appid: appId,
            count: NEWS_SHOWN,
            feeds: STEAM_NEWS_FEED,
            format: "json",
        });
        let data = await this.steamRequest(
            `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?${params}`,
            403
        );
        return (data?.appnews?.newsitems || []).slice(0, NEWS_SHOWN).map((n) => ({
            title: n.title || "\u200b",
            date: new Date(n.date * 1000),
            excerpt: this.excerpt(n.contents || ""),
            url: `https://store.steampowered.com/news/app/${appId}/view/${n.gid}`,
        }));
    },

    // How many are playing the app on Steam right now, or null if Steam has
    // no count for it (e.g. it has no player stats - Steam then answers 404).
    fetchCurrentPlayers: async function (appId) {
        let params = new URLSearchParams({ appid: appId, format: "json" });
        let data = await this.steamRequest(
            `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?${params}`,
            404
        );
        return data?.response?.result === 1 ? data.response.player_count : null;
    },

    // The start of an announcement as plain text, without its BBCode, HTML,
    // images and embedded videos.
    excerpt: function (contents) {
        let text = contents
            .replace(/\[(img|previewyoutube|video)\b[^\]]*\][\s\S]*?\[\/\1\]/gi, "")
            .replace(/\{STEAM_CLAN(_LOC)?_IMAGE\}\S*/g, "")
            .replace(/\[\*\]/g, "• ")
            .replace(BBCODE_TAG, " ")
            .replace(/\\([[\]])/g, "$1")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;|&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim();
        if (text.length <= EXCERPT_LENGTH) return text;
        let cut = text.slice(0, EXCERPT_LENGTH);
        let space = cut.lastIndexOf(" ");
        return `${(space > EXCERPT_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
    },
};

module.exports = mySteamNews;
