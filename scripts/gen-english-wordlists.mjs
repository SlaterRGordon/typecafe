// Derives frequency-sliced English word lists from the unigram frequency corpus.
//
// Source: data/unigram_freq.csv (333k words, "word,count", descending frequency).
// Extract it once from the committed data/unigram_freq.zip, then run:
//
//   node scripts/gen-english-wordlists.mjs
//
// Cleaning is strict on purpose: only ^[a-z]+$ survives (no digits, apostrophes,
// or accents), deduped in frequency order. The output JSON files are the shipped
// artifacts and load lazily in the browser — the CSV never reaches the client.
//
// english10k.json is intentionally NOT regenerated here: it is the default
// language and the daily-challenge seed, so it stays curated and stable.

import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "data", "unigram_freq.csv");
const OUT_DIR = join(__dirname, "..", "src", "components", "typer", "languages");

// label -> size. 10k is omitted (curated default left untouched).
const TARGETS = [
    { name: "english1k", size: 1_000 },
    { name: "english25k", size: 25_000 },
    { name: "english50k", size: 50_000 },
    { name: "english100k", size: 100_000 },
];

const maxSize = Math.max(...TARGETS.map((t) => t.size));
const onlyLetters = /^[a-z]+$/;

async function main() {
    const words = [];
    const seen = new Set();

    const rl = createInterface({ input: createReadStream(CSV), crlfDelay: Infinity });
    let header = true;
    for await (const line of rl) {
        if (header) { header = false; continue; } // drop "word,count"
        const word = line.slice(0, line.indexOf(",")).trim().toLowerCase();
        if (!word || seen.has(word) || !onlyLetters.test(word)) continue;
        seen.add(word);
        words.push(word);
        if (words.length >= maxSize) break; // we never need more than the largest slice
    }

    for (const { name, size } of TARGETS) {
        const slice = words.slice(0, size);
        const out = join(OUT_DIR, `${name}.json`);
        writeFileSync(out, JSON.stringify({ words: slice }));
        console.log(`${name}.json  ${slice.length.toLocaleString()} words`);
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
