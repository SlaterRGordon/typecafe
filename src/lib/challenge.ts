// Daily challenge text (Phase 5 §5.1). Free-tier by design: the challenge text
// is a pure function of the date, so every client generates byte-identical text
// locally with zero network calls or storage. Seeded PRNG over the word corpus,
// keyed by the local calendar day.

import { dayKey } from "./progress"

// Words in a daily-challenge run. Long enough that even a fast typist won't
// exhaust it within a 30s timed challenge (so no nondeterministic appended text).
export const CHALLENGE_WORD_COUNT = 120

// FNV-1a → uint32. Deterministic and well-distributed across date strings.
function hashSeed(text: string): number {
    let h = 2166136261 >>> 0
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 16777619)
    }
    return h >>> 0
}

// mulberry32 — a tiny, fast, fully deterministic PRNG. Same seed → same sequence
// on every platform (integer ops only, no float accumulation).
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The challenge's local calendar day, as YYYY-MM-DD. The day boundary is the
// user's local midnight (timezone-correct: 23:50 and 00:10 are different days).
export function challengeDateKey(now: Date, utcOffsetMinutes = 0): string {
    return dayKey(now, utcOffsetMinutes)
}

// Byte-identical challenge text for a given day: seeded word picks from the
// corpus. Same `dateKey` + same `words` → identical string everywhere.
export function challengeText(words: string[], dateKey: string, wordCount = CHALLENGE_WORD_COUNT): string {
    if (words.length === 0) return ""
    const rng = mulberry32(hashSeed(dateKey))
    const picked: string[] = []
    for (let i = 0; i < wordCount; i++) {
        picked.push(words[Math.floor(rng() * words.length)]!)
    }
    return picked.join(" ")
}
