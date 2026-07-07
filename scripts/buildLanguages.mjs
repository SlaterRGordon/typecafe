// @ts-nocheck  — standalone Node build script, not part of the app/tsc build.
// Regenerates the non-English word lists from open, permissively-licensed data.
//
//   Frequency data: Hermit Dave / FrequencyWords (OpenSubtitles 2018, MIT)
//     https://github.com/hermitdave/FrequencyWords
//   Profanity filter: LDNOOBW per-language lists (BSD/WTFPL)
//     https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
//
// The raw frequency lists are subtitle-derived: they carry URLs, abbreviations,
// single-letter junk and profanity in the top 10k. We keep pure-Latin tokens,
// drop 1-char noise (bar a tiny per-language allowlist of real one-letter words),
// scrub against the English blocklist AND the matching LDNOOBW list, dedupe, and
// take the top 10k by frequency.
//
// Run:  node scripts/buildLanguages.mjs   (needs Node 18+ for global fetch)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = join(__dirname, "..", "src", "components", "typer", "languages");

// name = output basename & JSON "name"; src = Hermit Dave lang code;
// ldnoobw = LDNOOBW filename; ones = real single-letter words to keep.
const LANGUAGES = [
    { name: "german10k",     src: "de", ldnoobw: "de", ones: [] },
    { name: "french10k",     src: "fr", ldnoobw: "fr", ones: ["a", "y"] },
    { name: "spanish10k",    src: "es", ldnoobw: "es", ones: ["y", "o", "a", "e", "u"] },
    { name: "italian10k",    src: "it", ldnoobw: "it", ones: ["e", "o", "a"] },
    { name: "portuguese10k", src: "pt", ldnoobw: "pt", ones: ["e", "a", "o"] },
    { name: "dutch10k",      src: "nl", ldnoobw: "nl", ones: [] },
    { name: "polish10k",     src: "pl", ldnoobw: "pl", ones: ["i", "a", "o", "w", "z", "u"] },
];

const TARGET = 10000;
const HERMIT = (lang) =>
    `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang}/${lang}_50k.txt`;
const LDNOOBW = (lang) =>
    `https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/${lang}`;

const LATIN_ONLY = /^\p{Script=Latin}+$/u;

// Fold spelling variants so profanity matches across ß/ss and diacritics:
// LDNOOBW lists "scheiße", subtitles write "scheisse"; both fold to "scheisse".
const fold = (w) => w.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.text();
}

async function loadBlockset(ldnoobwLang) {
    const english = JSON.parse(await readFile(join(LANG_DIR, "blocklist.json"), "utf8")).words;
    const foreign = (await fetchText(LDNOOBW(ldnoobwLang)))
        .split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean);
    return new Set([...english, ...foreign].map((w) => fold(w.toLowerCase())));
}

async function build(lang) {
    const block = await loadBlockset(lang.ldnoobw);
    const ones = new Set(lang.ones);
    const raw = await fetchText(HERMIT(lang.src));

    const seen = new Set();
    const words = [];
    for (const line of raw.split("\n")) {
        const word = line.split(" ")[0]?.toLowerCase();
        if (!word || !LATIN_ONLY.test(word)) continue;          // digits, punctuation, URLs, mixed scripts
        if (word.length < 2 && !ones.has(word)) continue;        // single-letter junk
        if (block.has(fold(word))) continue;                     // profanity (English + native, variant-folded)
        if (seen.has(word)) continue;                            // lowercasing collapses duplicates
        seen.add(word);
        words.push(word);
        if (words.length >= TARGET) break;
    }
    if (words.length < TARGET) console.warn(`  ! ${lang.name}: only ${words.length} words after filtering`);

    await writeFile(
        join(LANG_DIR, `${lang.name}.json`),
        JSON.stringify({ name: lang.name, words }) + "\n",
    );
    console.log(`  ${lang.name}: ${words.length} words`);
}

for (const lang of LANGUAGES) {
    process.stdout.write(`Building ${lang.name} (${lang.src})...\n`);
    await build(lang);
}
console.log("Done.");
