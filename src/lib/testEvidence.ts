import { detectImpossibleTimeline } from "./antiCheat"
import { decodeEvidenceTimeline, timelineDurationMs, type EncodedKeystroke } from "./keystrokes"
import { buildWpmSamples, computeStats, consistencyFromSamples, isRankableSample, type Keystroke } from "./stats"

export interface EvaluateTestEvidenceInput {
    timeline: EncodedKeystroke[]
    // Timed tests use their configured timer. Other tests use the evidence span.
    durationSeconds: number
    eligibleForRanking: boolean
    // Word tests prove that the final prompt-length matches their configuration.
    expectedWordCount?: number
}

export interface EvaluatedTestEvidence {
    speed: number
    accuracy: number
    consistency: number
    score: number
    netWpm: number
    characterCount: number
    incorrectCount: number
    observedWordCount: number
    ranked: boolean
}

// Replay one persisted attempt into its final stack and net-count timeline.
// This is the sole trust seam for saved metrics: callers provide configuration,
// never speed/accuracy/score summaries.
export function evaluateTestEvidence(input: EvaluateTestEvidenceInput): EvaluatedTestEvidence {
    const stack: Array<{ key: string, correct: boolean }> = []
    const countTimeline: Keystroke[] = []

    for (const event of decodeEvidenceTimeline(input.timeline)) {
        if ("action" in event) stack.pop()
        else stack.push({ key: event.key, correct: event.correct })
        countTimeline.push({ t: event.t, chars: stack.length })
    }

    const characterCount = stack.length
    const incorrectCount = stack.reduce((total, event) => total + (event.correct ? 0 : 1), 0)
    const evidenceDurationSeconds = timelineDurationMs(input.timeline) / 1000
    const stats = computeStats({
        timeline: countTimeline,
        characterCount,
        incorrectCount,
        isTimed: true,
        timedDurationSeconds: Math.max(input.durationSeconds, 0),
        fallbackStartTime: 0,
    })
    const text = stack.map((event) => event.key).join("").trim()
    const observedWordCount = text.length === 0 ? 0 : text.split(/\s+/).length
    const wordCountMatches = input.expectedWordCount === undefined || observedWordCount === input.expectedWordCount
    const ranked = input.eligibleForRanking &&
        wordCountMatches &&
        isRankableSample(evidenceDurationSeconds, characterCount) &&
        !detectImpossibleTimeline(input.timeline).impossible

    return {
        speed: stats.rawWpm,
        accuracy: stats.accuracy,
        consistency: consistencyFromSamples(buildWpmSamples(countTimeline)),
        score: stats.netWpm,
        netWpm: stats.netWpm,
        characterCount,
        incorrectCount,
        observedWordCount,
        ranked,
    }
}
