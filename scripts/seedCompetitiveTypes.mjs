// Seeds the competitive TestType rows a language needs before signed-in scores
// will save + rank (Typer guards saving on testType?.id; type.get returns null
// for an unseeded language - see src/lib/typeLanguage.ts).
//
// Each competitive language gets two rows: timed (mode 0, subMode 0) and words
// (mode 0, subMode 1), both competitive. There's no unique constraint on
// (mode, subMode, language), so inserts are guarded WHERE NOT EXISTS - the
// script is safe to re-run and to point at both the dev and prod databases.
//
//   Dev:   node --env-file=.env.local scripts/seedCompetitiveTypes.mjs
//   Prod:  node --env-file=.env       scripts/seedCompetitiveTypes.mjs

// @ts-nocheck  - standalone Node seed script, not part of the app/tsc build.
import pg from "pg";

const LANGUAGES = ["german", "italian", "portuguese", "dutch", "polish"];
const CONFIGS = [
    { mode: 0, subMode: 0 }, // timed
    { mode: 0, subMode: 1 }, // words
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let inserted = 0;
for (const language of LANGUAGES) {
    for (const { mode, subMode } of CONFIGS) {
        const res = await client.query(
            `INSERT INTO "TestType" (id, mode, "subMode", language, competitive, "createdAt", "updatedAt")
             SELECT gen_random_uuid()::text, $1, $2, $3, true, now(), now()
             WHERE NOT EXISTS (
                 SELECT 1 FROM "TestType" WHERE mode = $1 AND "subMode" = $2 AND language = $3
             )`,
            [mode, subMode, language],
        );
        inserted += res.rowCount;
        console.log(`${language.padEnd(10)} mode=${mode} subMode=${subMode} -> ${res.rowCount ? "inserted" : "exists"}`);
    }
}
console.log(`Done. ${inserted} row(s) inserted.`);
await client.end();
