import type { KeyAccuracy, TypedSegment, WpmSample } from "~/lib/stats"
import type { EncodedTimeline } from "~/lib/keystrokes"
import type { EvidenceContext } from "~/lib/evidenceContext"

export interface TestCompletionResult {
    worstKeys?: KeyAccuracy[],
    // Versioned compact per-keystroke timeline. Correct attempts store no
    // duplicate typed character; misses retain the actual character for coaching.
    timeline: EncodedTimeline,
    speed: number,
    rawWpm: number,
    netWpm: number,
    accuracy: number,
    durationSeconds: number,
    totalKeystrokes: number,
    correctKeystrokes: number,
    incorrectKeystrokes: number,
    promptText: string,
    typedText: string,
    typedSegments: TypedSegment[],
    wpmSamples: WpmSample[],
    punctuation: boolean,
    capitals: boolean,
    numbers: boolean,
    ranked: boolean,
    levelName?: string,
    // Boss levels: the pacer overtook the typist. A definitive loss regardless of
    // the net WPM measured over the typed span, so grading must force 0 stars.
    pacerCaught?: boolean,
    persisted: boolean,
    testId?: string,
    typeId?: string,
    brag?: string | null,
    // WPM vs the user's 30-day average at save time (null when too little history).
    avgDelta?: number | null,
    // Current practice-day streak at save time.
    streak?: number | null,
}

export enum TestModes {
    normal,
    practice,
    ngrams,
    relaxed,
    quotes
}

export type { EvidenceContext }

// Quote length buckets shown in the toolbar; "all" draws from every bucket.
export type QuoteLength = "all" | "short" | "medium" | "long"

// Vocabulary size for a word test, applied on top of the global language.
// English ships size-specific SCOWL files; other languages slice their single
// frequency-ranked list. "25k" is English-only (see docs/features/global-language.md).
export type WordSize = "1k" | "5k" | "10k" | "25k"

export enum TestSubModes {
    timed,
    words
}

export enum TestGramSources {
    bigrams,
    trigrams,
    tetragrams,
    words
}

export enum TestGramScopes {
    fifty = 50,
    oneHundred = 100,
    twoHundred = 200,
}
