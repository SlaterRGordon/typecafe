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
// All tiers come from this one pipeline, so they nest cleanly
// (1k ⊂ 5k ⊂ 10k ⊂ 25k). english10k.json is the default language (imported
// in utils.tsx) and the daily-challenge seed.

import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "data", "unigram_freq.csv");
const SCOWL = join(__dirname, "..", "data", "scowl-en-us.txt");
const OUT_DIR = join(__dirname, "..", "src", "components", "typer", "languages");

const TARGETS = [
    { name: "english1k", size: 1_000 },
    { name: "english5k", size: 5_000 },
    { name: "english10k", size: 10_000 },
    { name: "english25k", size: 25_000 },
];

const maxSize = Math.max(...TARGETS.map((t) => t.size));
const onlyLetters = /^[a-z]+$/;

// SCOWL is a spell-checker dictionary, so it accepts every single letter plus
// initialisms and abbreviations that rank high in a web crawl but aren't real
// typing words. Short tokens are where this concentrates, so they get an
// explicit allowlist; a small blocklist catches the longer offenders (month
// abbreviations, common acronyms).
const ONE_LETTER_OK = new Set(["a", "i"]);
const TWO_LETTER_OK = new Set(
    "am an as at be by do go he hi if in is it me my no of oh ok on or so to up us we".split(" "),
);
const BLOCKLIST = new Set([
    // month abbreviations (mar/may are real words, so left in)
    "jan", "feb", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    // acronyms / initialisms SCOWL accepts but nobody "practices" typing
    "usa", "url", "faq", "dvd", "cdrom", "html", "http", "https", "www", "ftp",
    "pm", "tv", "cd", "pc", "uk",
]);

// SCOWL membership isn't enough for 1-2 letter tokens - gate those on the
// allowlists; length >= 3 is trusted via SCOWL minus the blocklist.
/** @param {string} word @returns {boolean} */
function isRealTypingWord(word) {
    if (BLOCKLIST.has(word)) return false;
    if (word.length === 1) return ONE_LETTER_OK.has(word);
    if (word.length === 2) return TWO_LETTER_OK.has(word);
    return true;
}

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
        if (!word || seen.has(word) || !onlyLetters.test(word) || !dict.has(word) || !isRealTypingWord(word)) continue;
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
