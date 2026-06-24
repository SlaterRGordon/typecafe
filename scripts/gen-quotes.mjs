// Curates a small, clean quote set for the typer's Quotes mode, bucketed by
// length (short/medium/long). Build input (never ships): the Goodreads quotes
// dump, extracted from quotes.zip in the repo root.
//
//   unzip -o quotes.zip quotes.csv   # 144MB, ~500k rows, do not commit
//   node scripts/gen-quotes.mjs
//
// The source is messy (newlines collapsed to commas inside fields, smart
// punctuation, junk rows), so we normalize to typeable ASCII and drop anything
// that still looks off. Output: src/components/typer/languages/quotes.json.

import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "quotes.csv");
const OUT = join(__dirname, "..", "src", "components", "typer", "languages", "quotes.json");

const PER_BUCKET = 250; // keeps the bundle small; ~750 total at most
const SHORT_MAX = 120;
const MEDIUM_MAX = 220;
const LONG_MAX = 300;
const MIN_LEN = 40;

// Map common smart punctuation to ASCII the keyboard can actually type.
/** @param {string} text @returns {string} */
function normalize(text) {
    return text
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/,(?=[A-Za-z])/g, ", ") // the dump's collapsed-newline commas
        .replace(/\s+/g, " ")
        .trim();
}

// Only quotes made entirely of characters a typist can reach. Anything with
// leftover unicode (other scripts, stray symbols) is dropped rather than mangled.
const SAFE = /^[A-Za-z0-9 .,!?;:'"()\-]+$/;

/** @param {number} len @returns {"short"|"medium"|"long"|null} */
function bucketOf(len) {
    if (len < SHORT_MAX) return "short";
    if (len < MEDIUM_MAX) return "medium";
    if (len <= LONG_MAX) return "long";
    return null;
}

// Column 0 (the quote) of a CSV row. Quoted when it contains commas; the dump
// has no in-field newlines (they were collapsed to commas), so one line = one row.
/** @param {string} line @returns {string} */
function col0(line) {
    if (line[0] !== '"') {
        const comma = line.indexOf(",");
        return comma === -1 ? line : line.slice(0, comma);
    }
    let out = "";
    for (let i = 1; i < line.length; i++) {
        if (line[i] === '"') {
            if (line[i + 1] === '"') { out += '"'; i++; continue; } // escaped ""
            break;
        }
        out += line[i];
    }
    return out;
}

async function main() {
    /** @type {{ short: string[], medium: string[], long: string[] }} */
    const buckets = { short: [], medium: [], long: [] };
    const full = () => buckets.short.length >= PER_BUCKET && buckets.medium.length >= PER_BUCKET && buckets.long.length >= PER_BUCKET;
    const seen = new Set();
    let header = true;
    let scanned = 0;

    const rl = createInterface({ input: createReadStream(CSV, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
        if (header) { header = false; continue; } // "quote,author,category"
        scanned += 1;
        const text = normalize(col0(line));
        if (text.length < MIN_LEN || text.length > LONG_MAX) continue;
        if (!SAFE.test(text)) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        const bucket = bucketOf(text.length);
        if (!bucket || buckets[bucket].length >= PER_BUCKET) continue;
        seen.add(key);
        buckets[bucket].push(text);
        if (full()) break;
    }

    writeFileSync(OUT, JSON.stringify(buckets));
    console.log(`scanned ${scanned.toLocaleString()} rows`);
    console.log(`short ${buckets.short.length} | medium ${buckets.medium.length} | long ${buckets.long.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
