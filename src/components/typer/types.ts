import type { KeyAccuracy, TypedSegment, WpmSample } from "~/lib/stats"
import type { EncodedKeystroke } from "~/lib/keystrokes"

export interface TestCompletionResult {
    worstKeys?: KeyAccuracy[],
    // Compact per-keystroke timeline ([charCode, correct, dtMs] deltas) — the
    // foundation diagnosis and later trends read from. Empty for a no-keystroke test.
    timeline: EncodedKeystroke[],
    speed: number,
    rawWpm: number,
    netWpm: number,
    accuracy: number,
    durationSeconds: number,
    totalKeystrokes: number,
    correctKeystrokes: number,
    incorrectKeystrokes: number,
    typedText: string,
    typedSegments: TypedSegment[],
    wpmSamples: WpmSample[],
    punctuation: boolean,
    capitals: boolean,
    ranked: boolean,
    levelName?: string,
    persisted: boolean,
    testId?: string,
    typeId?: string,
    brag?: string | null,
}

export enum TestModes {
    normal,
    practice,
    ngrams,
    relaxed
}

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