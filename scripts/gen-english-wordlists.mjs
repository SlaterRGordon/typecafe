// Derives clean, frequency-ranked English word lists for the typer.
//
// Two committed build inputs (neither ever ships to the client):
//   data/unigram_freq.zip  -> data/unigram_freq.csv  (333k words by frequency)
//   data/scowl-en-us.txt   (SCOWL en-US dictionary, the "is this a real word" set)
//
// SCOWL source (regenerate if needed): https://app.aspell.net/create
//   max_size=60  spelling=US  diacritic=strip  format=inline  encoding=utf-8
//
// The frequency corpus is a web crawl, so on its own it ranks brand names,
// other languages, and typos as "frequent" (lumix, nyheter, winmodem...). We
// keep its useful common-first ordering but drop anything not present in SCOWL.
//
// Run (after extracting the csv from the zip):
//   node scripts/gen-english-wordlists.mjs
//
// english10k.json is intentionally NOT regenerated: it's the curated default
// language and the daily-challenge seed, and is already clean.

import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "data", "unigram_freq.csv");
const SCOWL = join(__dirname, "..", "data", "scowl-en-us.txt");
const OUT_DIR = join(__dirname, "..", "src", "components", "typer", "languages");

// label -> size. 10k is omitted (curated default left untouched).
const TARGETS = [
    { name: "english1k", size: 1_000 },
    { name: "english5k", size: 5_000 },
    { name: "english25k", size: 25_000 },
];

const maxSize = Math.max(...TARGETS.map((t) => t.size));
const onlyLetters = /^[a-z]+$/;

// SCOWL membership set: each accepted line is a single a-z token once lowercased.
// This skips the prose header and drops possessives/accented variants for free.
function loadDictionary() {
    const dict = new Set();
    for (const raw of readFileSync(SCOWL, "utf8").split(/\r?\n/)) {
        const word = raw.trim().toLowerCase();
        if (onlyLetters.test(word)) dict.add(word);
    }
    return dict;
}

async function main() {
    const dict = loadDictionary();
    console.log(`SCOWL dictionary: ${dict.size.toLocaleString()} words`);

    const words = [];
    const seen = new Set();
    let scanned = 0;

    const rl = createInterface({ input: createReadStream(CSV), crlfDelay: Infinity });
    let header = true;
    for await (const line of rl) {
        if (header) { header = false; continue; } // drop "word,count"
        scanned += 1;
        const word = line.slice(0, line.indexOf(",")).trim().toLowerCase();
        if (!word || seen.has(word) || !onlyLetters.test(word) || !dict.has(word)) continue;
        seen.add(word);
        words.push(word);
        if (words.length >= maxSize) break;
    }

    if (words.length < maxSize) {
        console.warn(`WARNING: only ${words.length} clean words found (wanted ${maxSize}); the frequency tail ran out of real words.`);
    }
    console.log(`Kept ${words.length.toLocaleString()} clean words from ${scanned.toLocaleString()} frequency rows scanned.`);

    for (const { name, size } of TARGETS) {
        const slice = words.slice(0, size);
        writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify({ words: slice }));
        console.log(`${name}.json  ${slice.length.toLocaleString()} words`);
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
