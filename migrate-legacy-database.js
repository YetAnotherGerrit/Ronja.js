"use strict";

// One-time migration of data from a pre-Sequelize-migrations Ronja.js database
// (Games / GamesPlayeds / Members tables) into the current schema (Game / GameStatus /
// MemberSetting). Bot configuration (the old _SECRET/config.js) is intentionally NOT
// migrated - reconfigure that via the new Setting-based config after migrating.
//
// Usage:
//   npm run migrate-legacy -- /path/to/old/database.sqlite
//
// Run this AFTER `npm run dev:migrate` (the new tables must already exist).
// Safe to re-run: games/game-status keep their original ids (upserted), and
// member settings are matched on memberid+name, so re-running just re-applies
// the same values instead of duplicating rows.

require("dotenv").config();

const sqlite3 = require("sqlite3");
const db = require("./models/index.js");

function openLegacyDb(legacyPath) {
    return new sqlite3.Database(legacyPath, sqlite3.OPEN_READONLY);
}

function all(legacyDb, sql) {
    return new Promise((resolve, reject) => {
        legacyDb.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

async function migrateGames(legacyDb) {
    const games = await all(legacyDb, "SELECT id, name, channel, createdAt, updatedAt FROM Games");

    for (const game of games) {
        await db.Game.upsert({
            id: game.id,
            name: game.name,
            channel: game.channel,
            createdAt: game.createdAt,
            updatedAt: game.updatedAt,
        });
    }

    console.log(`Migrated ${games.length} games.`);
}

async function migrateGameStatus(legacyDb) {
    const played = await all(
        legacyDb,
        "SELECT id, member, lastplayed, createdAt, updatedAt, GameId FROM GamesPlayeds"
    );

    for (const p of played) {
        await db.GameStatus.upsert({
            id: p.id,
            member: p.member,
            lastplayed: p.lastplayed,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            GameId: p.GameId,
        });
    }

    console.log(`Migrated ${played.length} game-status (play history) rows.`);
}

async function migrateMemberSettings(legacyDb) {
    // `id` is a snowflake stored with INTEGER affinity; CAST to TEXT so sqlite3
    // returns the exact digits instead of a float-rounded JS number (snowflakes
    // exceed Number.MAX_SAFE_INTEGER).
    const members = await all(
        legacyDb,
        "SELECT CAST(id AS TEXT) as id, zockenmention, createdAt, updatedAt FROM Members"
    );

    for (const member of members) {
        const [row] = await db.MemberSetting.findOrCreate({
            where: { memberid: member.id, name: "zockenmention" },
            defaults: {
                value: String(member.zockenmention),
                createdAt: member.createdAt,
                updatedAt: member.updatedAt,
            },
        });
        await row.update({ value: String(member.zockenmention) });
    }

    console.log(`Migrated ${members.length} member settings (zockenmention).`);
}

async function main() {
    const legacyPath = process.argv[2];
    if (!legacyPath) {
        console.error("Usage: npm run migrate-legacy -- /path/to/old/database.sqlite");
        process.exit(1);
    }

    const legacyDb = openLegacyDb(legacyPath);

    try {
        await migrateGames(legacyDb);
        await migrateGameStatus(legacyDb);
        await migrateMemberSettings(legacyDb);
        console.log("Legacy database migration complete.");
    } finally {
        legacyDb.close();
        await db.sequelize.close();
    }
}

main().catch((err) => {
    console.error("Legacy database migration failed:", err);
    process.exit(1);
});
