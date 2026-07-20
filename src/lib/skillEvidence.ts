// Cost-ranked typing evidence for the coach. This is the public, persistence-
// agnostic seam between normalized Timelines and every recommendation surface.
// React owns prose; this module returns stable reason codes and measured data.

import { correctionEpisodes } from "./corrections"
import { discoversWeakness, practiceRecordMatchesEvidence, type EvidenceContext, type PracticeRecord } from "./evidenceContext"
import type { TimelineEvidence } from "./evidenceNormalization"
import { attemptsFromEvents, type KeyAttempt } from "./heatmap"
import { isTrackableTransitionPair } from "./drillableTransitions"
import { decodeEvidenceTimeline, decodeTimeline, timelineDurationMs, type KeystrokeEvent, type TestEvidenceEvent } from "./keystrokes"
import { classifyMovement, type MovementKind } from "./movementClassification"
import { evaluateTestEvidence } from "./testEvidence"
import { parseDrillTargetToken, sameCoachingTarget, type CoachingTarget } from "./coachingTarget"
import type { DailyCoachingSession, FrozenRecommendation } from "./dailyCoaching"
import { aggregateTransitions, mergeTransitions, type TransitionAggregate } from "./transitions"
export type { CoachingTarget } from "./coachingTarget"

export const SKILL_EVIDENCE_THRESHOLDS = {
    interruptionMaxMs: 2_000,
    interruptionMadMultiplier: 6,
    keyAccuracyMinAttempts: 20,
    keyAccuracyFloorPct: 95,
    keyLatencyMinSamples: 15,
    keyLatencyMinPredecessors: 2,
    keyLatencyMinRatio: 1.2,
    transitionMinSamples: 8,
    transitionMinTests: 2,
    transitionMinWords: 4,
    transitionLatencyMinRatio: 1.2,
    transitionErrorRateFloorPct: 8,
    trigramMinSamples: 5,
    trigramMinTests: 2,
    trigramMinWords: 3,
    tetragramMinSamples: 4,
    tetragramMinTests: 2,
    tetragramMinWords: 2,
    wordMinSamples: 3,
    wordMinTests: 2,
    higherOrderLatencyMinRatio: 1.2,
    naturalFrequencyMinCharacters: 1_000,
    maxGramCandidatesPerSize: 8,
    maxWordCandidates: 8,
    maxTargetWords: 6,
    movementMinSamples: 30,
    movementMinSequences: 4,
    enduranceMinTestsPerLength: 3,
    enduranceShortMaxSeconds: 30,
    enduranceLongMinSeconds: 60,
    enduranceMinGapWpm: 1,
    optionCostMinTests: 3,
    optionCostMinGapWpm: 1,
    correctionMinErrors: 3,
    correctionMinTests: 2,
    correctionFallbackLatencyMultiplier: 3,
    latencyNoiseFloorMs: 10,
    materialImpactMsPer1000: 25,
    oldestVolumeWeight: 0.5,
    abilitySplitMinSamplesPerHalf: 4,
    // "Recent" is the newest N Tests that contained the Target, so a drill
    // followed by a Test moves the number the same day instead of after half
    // the evidence window turns over.
    abilityRecentTestWindow: 5,
} as const

export const MASTERY_CHECK_INTERVALS = {
    afterTransferLocalDays: 1,
    afterFirstHeldPracticedDays: 3,
    afterLaterHeldPracticedDays: 7,
} as const

export type SkillReason =
    | { code: "key_latency_above_baseline", key: string, observedMs: number, baselineMs: number, ratio: number }
    | { code: "key_accuracy_below_threshold", key: string, accuracyPct: number, errorRatePct: number }
    | { code: "transition_latency_above_baseline", pair: string, observedMs: number, baselineMs: number, ratio: number }
    | { code: "transition_error_rate_high", pair: string, accuracyPct: number, errorRatePct: number }
    | { code: "correction_confusion_recurs", expected: string, typed: string, errors: number, errorRatePct: number }
    | { code: "gram_internal_latency_high", gram: string, observedMs: number, baselineMs: number, excessMs: number, carrierWords: string[] }
    | { code: "word_internal_latency_high", words: string[], observedMs: number, baselineMs: number, sharedGram?: string }
    | { code: "movement_latency_high", movement: MovementKind, observedMs: number, baselineMs: number, anchors: string[] }
    | { code: "endurance_fade", shortSeconds: number, longSeconds: number, shortWpm: number, longWpm: number, gapWpm: number }

export interface AcquisitionResponse {
    context: "acquisition"
    value: number
    sampleCount: number
    runCount: number
}

/** Activity and performance measured only inside versioned Practice records. */
export interface PracticeActivity {
    focusedTimeMs: number
    completedRuns: number
    sampleCount: number
    value?: number
}

/**
 * A Target's ability measured from natural/diagnostic evidence only. The split
 * compares everything before the newest abilityRecentTestWindow Tests that
 * contained the Target against those newest Tests, so every Target can show an
 * honest earlier -> recent trajectory without a frozen prescription baseline
 * and without drill-saturated samples inflating it.
 */
export interface NaturalAbility {
    value: number
    sampleCount: number
    split?: { earlier: number, recent: number, earlierSamples: number, recentSamples: number }
}

export interface SkillCandidate {
    id: string
    target: CoachingTarget
    metric: "ms" | "%" | "wpm"
    direction: "lower" | "higher"
    observed: number
    baseline: number
    sampleCount: number
    distinctTests: number
    distinctWords: number
    frequencyPer1000: number
    confidence: number
    recencyWeight: number
    impactMsPer1000: number
    reason: SkillReason
    response?: AcquisitionResponse
    practice?: PracticeActivity
    ability?: NaturalAbility
    /** Newest drill for this Target is newer than its last natural evidence. */
    awaitingMeasurement?: boolean
}

export interface EvidenceQuality {
    status: "none" | "thin" | "ready"
    analyzedTimelines: number
    discoveryTimelines: number
    naturalTimelines: number
    acquisitionTimelines: number
    discoveryCharacters: number
    usableLatencySamples: number
    excludedNonPositiveGaps: number
    excludedInterruptionGaps: number
    interrupted: boolean
}

export interface TargetProof {
    target: CoachingTarget
    metric: "ms" | "%" | "wpm"
    baseline: number
    bestAcquisition?: number
    transfer?: number
    cold?: number
    improvedInTransfer: boolean
    heldCold: boolean | null
    sampleCounts: { baseline: number, transfer: number, cold: number }
}

export interface MasteryRecord {
    id: string
    target: CoachingTarget
    state: "training" | "transferred" | "retained" | "due" | "regressed"
    prescription: FrozenRecommendation
    proof: TargetProof
    prescribedDate: string
    lastEvidenceDate: string
    heldColdChecks: number
    practicedDaysUntilDue: number | null
    /** Focused drill completions are practice volume, never proof of ability. */
    practiceSets?: number
    practiceSamples?: number
    response?: AcquisitionResponse
    practice?: PracticeActivity
    ability?: NaturalAbility
    /** Newest drill for this Target is newer than its last natural evidence. */
    awaitingMeasurement?: boolean
}

export interface SkillRecap {
    retained: MasteryRecord[]
    due: MasteryRecord | null
    regressed: MasteryRecord | null
}

export interface SkillAnalysis {
    quality: EvidenceQuality
    candidates: SkillCandidate[]
    recommendation: SkillCandidate | null
    mastery: MasteryRecord[]
    recap: SkillRecap
    testFamilyCosts: TestFamilyCost[]
    /** Span of the discovery Tests the numbers are measured from. */
    evidenceWindow: { tests: number, fromMs: number, toMs: number } | null
}

export interface TestFamilyCost {
    kind: "punctuation" | "capitals" | "numbers"
    baselineWpm: number
    enabledWpm: number
    gapWpm: number
    baselineTests: number
    enabledTests: number
}

export interface SkillEvidenceInput {
    timelines: readonly TimelineEvidence[]
    // Frequency-ranked words for the active language. Persistence and loading
    // stay outside this pure module; analysis derives bounded priors on demand.
    corpusWords?: readonly string[]
    // Parsed, same-language/pool Coaching snapshots. Mastery is derived on read;
    // callers retain ownership of persistence and scoping.
    sessions?: readonly DailyCoachingSession[]
    todayDateKey?: string
    scope?: { language: string, pool: string }
}

export interface NaturalKeyboardEvidence {
    attempts: Record<string, KeyAttempt>
    transitions: TransitionAggregate[]
}

/** Progress keyboard proof comes only from explicitly tagged ordinary Tests. */
export function projectNaturalKeyboardEvidence(timelines: readonly TimelineEvidence[]): NaturalKeyboardEvidence {
    const attempts = new Map<string, KeyAttempt>()
    let transitions: TransitionAggregate[] = []
    for (const timeline of timelines) {
        if (timeline.context !== "natural") continue
        const events = decodeTimeline(timeline.timeline)
        for (const [key, value] of attemptsFromEvents(events, timeline.layout)) {
            const current = attempts.get(key) ?? { attempts: 0, correct: 0 }
            attempts.set(key, { attempts: current.attempts + value.attempts, correct: current.correct + value.correct })
        }
        transitions = mergeTransitions(transitions, aggregateTransitions(events))
    }
    return { attempts: Object.fromEntries(attempts), transitions }
}

// A live score card may use recent natural history to establish that a
// higher-order Target recurs, but the card still describes the Test that just
// finished. Require that run to contain the Target and reproduce the latency
// weakness before surfacing the historical candidate.
export function currentTimelineSupportsHigherOrderCandidate(
    candidate: SkillCandidate,
    timeline: TimelineEvidence,
): boolean {
    if (candidate.target.kind !== "gram" && candidate.target.kind !== "word") return false

    const evidence = prepareEvidence([timeline])
    const arrivals = evidence.arrivals.filter((sample) => discoversWeakness(sample.context))
    const baselineMs = median(arrivals.map((sample) => sample.dtMs))
    if (baselineMs <= 0) return false

    if (candidate.target.kind === "gram") {
        const gram = candidate.target.gram
        const samples = evidence.grams.filter((sample) => sample.gram === gram)
        if (samples.length === 0) return false
        const observedMs = median(samples.map((sample) => sample.internalMs))
        const targetBaselineMs = baselineMs * ([...gram].length - 1)
        return observedMs - targetBaselineMs >= SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs &&
            observedMs / targetBaselineMs >= SKILL_EVIDENCE_THRESHOLDS.higherOrderLatencyMinRatio
    }

    const targetWords = new Set(candidate.target.words)
    const samples = evidence.words.filter((sample) => targetWords.has(sample.word))
    if (samples.length === 0) return false
    const observedMs = median(samples.map((sample) => sample.internalMs / sample.arrivals))
    return observedMs - baselineMs >= SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs &&
        observedMs / baselineMs >= SKILL_EVIDENCE_THRESHOLDS.higherOrderLatencyMinRatio
}

interface ArrivalSample {
    key: string
    predecessor: string
    pair: string | null
    dtMs: number
    correct: boolean
    testId: number
    word: string
    context: EvidenceContext
    recencyWeight: number
    movement: MovementKind | null
    sequence: string
}

interface AttemptSample {
    key: string
    typed: string | null
    correct: boolean
    testId: number
    context: EvidenceContext
    recencyWeight: number
}

interface CorrectionSample {
    expected: string
    typed: string
    costMs: number
    testId: number
    context: EvidenceContext
    recencyWeight: number
}

interface GramSample {
    gram: string
    internalMs: number
    testId: number
    word: string
    context: EvidenceContext
    recencyWeight: number
}

interface WordSample {
    word: string
    internalMs: number
    arrivals: number
    testId: number
    context: EvidenceContext
    recencyWeight: number
}

interface PreparedEvidence {
    arrivals: ArrivalSample[]
    attempts: AttemptSample[]
    corrections: CorrectionSample[]
    grams: GramSample[]
    words: WordSample[]
    frequencyCharacters: number
    keyFrequency: Map<string, number>
    pairFrequency: Map<string, number>
    gramFrequency: Map<string, number>
    wordFrequency: Map<string, number>
    // testId -> the Target an acquisition run was launched for, from the
    // persisted drill token. Runs without a token attribute to no Target.
    drillTargets: Map<number, CoachingTarget>
    practiceRuns: Map<number, PracticeRecord>
    testCompletedAt: Map<number, number>
    quality: EvidenceQuality
}

function median(values: readonly number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
        ? sorted[middle]!
        : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function mean(values: readonly number[]): number {
    return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value))
}

function normalizedKey(key: string): string {
    return key.toLocaleLowerCase()
}

function isTargetableKey(key: string): boolean {
    return /^\p{L}$/u.test(key)
}

function isBoundary(key: string): boolean {
    return /^\s$/u.test(key) || /^[.!?;:]$/u.test(key)
}

function replayFinalEvents(events: readonly TestEvidenceEvent[]): KeystrokeEvent[] {
    const stack: KeystrokeEvent[] = []
    for (const event of events) {
        if ("action" in event) stack.pop()
        else stack.push(event)
    }
    return stack
}

function finalFrequency(events: readonly TestEvidenceEvent[]): {
    characters: number
    keys: Map<string, number>
    pairs: Map<string, number>
} {
    const keys = new Map<string, number>()
    const pairs = new Map<string, number>()
    let characters = 0
    let previous: string | null = null

    for (const event of replayFinalEvents(events)) {
        const key = normalizedKey(event.key)
        if (isBoundary(key)) {
            previous = null
            continue
        }
        characters += 1
        keys.set(key, (keys.get(key) ?? 0) + 1)
        if (previous) {
            const pair = previous + key
            if (isTrackableTransitionPair(pair)) pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
        }
        previous = key
    }
    return { characters, keys, pairs }
}

function addCounts(target: Map<string, number>, incoming: ReadonlyMap<string, number>): void {
    for (const [key, value] of incoming) target.set(key, (target.get(key) ?? 0) + value)
}

function addHigherOrderFrequency(word: string, grams: Map<string, number>, words: Map<string, number>): void {
    const characters = [...word]
    if (characters.length < 2) return
    words.set(word, (words.get(word) ?? 0) + 1)
    for (const size of [3, 4]) {
        for (let index = 0; index + size <= characters.length; index += 1) {
            const gram = characters.slice(index, index + size).join("")
            grams.set(gram, (grams.get(gram) ?? 0) + 1)
        }
    }
}

function interruptionLimitFor(events: readonly KeystrokeEvent[]): number {
    const gaps: number[] = []
    let previous: KeystrokeEvent | null = null
    for (const event of events) {
        const key = normalizedKey(event.key)
        if (!isTargetableKey(key)) {
            previous = null
            continue
        }
        if (previous) gaps.push(event.t - previous.t)
        previous = event
    }
    const positive = gaps.filter((gap) => gap > 0)
    if (positive.length === 0) return 0
    const center = median(positive)
    const mad = median(positive.map((gap) => Math.abs(gap - center)))
    return Math.min(
        SKILL_EVIDENCE_THRESHOLDS.interruptionMaxMs,
        center + SKILL_EVIDENCE_THRESHOLDS.interruptionMadMultiplier * mad,
    )
}

function timelineVolumeWeights(timelines: readonly TimelineEvidence[]): Map<number, number> {
    const discovery = timelines
        .map((timeline, testId) => ({ timeline, testId }))
        .filter(({ timeline }) => discoversWeakness(timeline.context))
        .sort((a, b) => b.timeline.completedAt - a.timeline.completedAt || a.testId - b.testId)
        .map((entry) => ({ ...entry, characters: finalFrequency(decodeEvidenceTimeline(entry.timeline.timeline)).characters }))
    const total = discovery.reduce((sum, item) => sum + Math.max(item.characters, 1), 0)
    const weights = new Map<number, number>()
    let consumed = 0
    for (const item of discovery) {
        const volume = Math.max(item.characters, 1)
        const midpoint = consumed + volume / 2
        const progress = total === 0 ? 0 : midpoint / total
        weights.set(item.testId, 1 - (1 - SKILL_EVIDENCE_THRESHOLDS.oldestVolumeWeight) * progress)
        consumed += volume
    }
    return weights
}

function prepareEvidence(timelines: readonly TimelineEvidence[]): PreparedEvidence {
    const arrivals: ArrivalSample[] = []
    const attempts: AttemptSample[] = []
    const corrections: CorrectionSample[] = []
    const grams: GramSample[] = []
    const words: WordSample[] = []
    const keyFrequency = new Map<string, number>()
    const pairFrequency = new Map<string, number>()
    const gramFrequency = new Map<string, number>()
    const wordFrequency = new Map<string, number>()
    const drillTargets = new Map<number, CoachingTarget>()
    const practiceRuns = new Map<number, PracticeRecord>()
    const testCompletedAt = new Map<number, number>(timelines.map((timeline, testId) => [testId, timeline.completedAt]))
    const recencyWeights = timelineVolumeWeights(timelines)
    let frequencyCharacters = 0
    let excludedNonPositiveGaps = 0
    let excludedInterruptionGaps = 0
    let discoveryCharacters = 0
    let naturalTimelines = 0
    let discoveryTimelines = 0
    let acquisitionTimelines = 0

    timelines.forEach((timeline, testId) => {
        const context = timeline.context
        if (!context) return
        const discovery = discoversWeakness(context)
        const attributedTarget = parseDrillTargetToken(timeline.options)
        const validPractice = timeline.practice && practiceRecordMatchesEvidence(timeline.practice, context, attributedTarget)
            ? timeline.practice
            : null
        if (validPractice) practiceRuns.set(testId, validPractice)
        // Only timer-completed, exactly attributed Guided Practice is Target
        // response evidence. Custom Practice stays item history and interrupted
        // runs stay activity, never response or an awaiting-measurement trigger.
        const acquisition = context === "acquisition" && validPractice?.kind === "guided" && validPractice.completed
        const customPractice = context === "custom-practice" && validPractice?.kind === "custom" && validPractice.completed
        if (!discovery && !acquisition && !customPractice) return
        if (discovery) discoveryTimelines += 1
        if (context === "natural") naturalTimelines += 1
        if (acquisition) {
            acquisitionTimelines += 1
            drillTargets.set(testId, validPractice.target)
        }

        const events = decodeEvidenceTimeline(timeline.timeline)
        const frequency = finalFrequency(events)
        if (discovery) discoveryCharacters += frequency.characters
        // Prefer ordinary natural occurrence rates. Diagnostic frequency is a
        // first-prescription fallback only when no natural text exists.
        const includeFrequency = context === "natural" || naturalTimelines === 0
        if (includeFrequency && discovery) {
            frequencyCharacters += frequency.characters
            addCounts(keyFrequency, frequency.keys)
            addCounts(pairFrequency, frequency.pairs)
        }

        const recencyWeight = recencyWeights.get(testId) ?? 1
        const forwardGaps: number[] = []
        let previous: KeystrokeEvent | null = null
        let currentWordEvents: KeystrokeEvent[] = []
        const wordByEvent = new Map<KeystrokeEvent, string>()

        const flushWord = () => {
            const word = currentWordEvents.map((event) => normalizedKey(event.key)).join("")
            for (const event of currentWordEvents) wordByEvent.set(event, word)
            currentWordEvents = []
        }

        for (const event of events) {
            if ("action" in event) {
                flushWord()
                previous = null
                continue
            }
            const key = normalizedKey(event.key)
            attempts.push({ key, typed: event.typed?.toLocaleLowerCase() ?? null, correct: event.correct, testId, context, recencyWeight })
            if (isBoundary(key)) {
                flushWord()
                previous = null
                continue
            }
            currentWordEvents.push(event)
            if (previous) forwardGaps.push(event.t - previous.t)
            previous = event
        }
        flushWord()

        const positiveGaps = forwardGaps.filter((gap) => gap > 0)
        const center = median(positiveGaps)
        const mad = median(positiveGaps.map((gap) => Math.abs(gap - center)))
        const interruptionThreshold = Math.min(
            SKILL_EVIDENCE_THRESHOLDS.interruptionMaxMs,
            center + SKILL_EVIDENCE_THRESHOLDS.interruptionMadMultiplier * mad,
        )

        previous = null
        for (const event of events) {
            if ("action" in event) {
                previous = null
                continue
            }
            const key = normalizedKey(event.key)
            if (isBoundary(key)) {
                previous = null
                continue
            }
            if (previous) {
                const dtMs = event.t - previous.t
                if (dtMs <= 0) excludedNonPositiveGaps += 1
                else if (dtMs > interruptionThreshold) excludedInterruptionGaps += 1
                else {
                    const predecessor = normalizedKey(previous.key)
                    const pair = predecessor + key
                    const movement = classifyMovement(predecessor, key, timeline.layout)?.kind ?? null
                    arrivals.push({
                        key,
                        predecessor,
                        pair: isTrackableTransitionPair(pair) ? pair : null,
                        dtMs,
                        correct: event.correct,
                        testId,
                        word: wordByEvent.get(event) ?? "",
                        context,
                        recencyWeight,
                        movement,
                        sequence: pair,
                    })
                }
            }
            previous = event
        }

        for (const episode of correctionEpisodes(events)) {
            const expected = normalizedKey(episode.expected)
            const typed = normalizedKey(episode.typed)
            if (!isTargetableKey(expected) || !isTargetableKey(typed)) continue
            corrections.push({ expected, typed, costMs: episode.costMs, testId, context, recencyWeight })
        }

        // Higher-order weakness discovery remains natural-only, while the same
        // extraction on acquisition runs lets Progress report drill volume and
        // performance separately from representative ability.
        if (context === "natural" || context === "acquisition" || context === "custom-practice") {
            const finalEvents = replayFinalEvents(events)
            const threshold = interruptionLimitFor(finalEvents)
            let currentWord: KeystrokeEvent[] = []
            const flushHigherOrderWord = () => {
                if (currentWord.length === 0) return
                const characters = currentWord.map((event) => normalizedKey(event.key))
                const word = characters.join("")
                if (context === "natural") addHigherOrderFrequency(word, gramFrequency, wordFrequency)
                if (currentWord.length >= 3 && currentWord.every((event) => event.correct)) {
                    const gaps = currentWord.slice(1).map((event, index) => event.t - currentWord[index]!.t)
                    if (threshold > 0 && gaps.every((gap) => gap > 0 && gap <= threshold)) {
                        words.push({
                            word,
                            internalMs: gaps.reduce((sum, gap) => sum + gap, 0),
                            arrivals: gaps.length,
                            testId,
                            context,
                            recencyWeight,
                        })
                        for (const size of [3, 4]) {
                            for (let index = 0; index + size <= currentWord.length; index += 1) {
                                grams.push({
                                    gram: characters.slice(index, index + size).join(""),
                                    internalMs: gaps.slice(index, index + size - 1).reduce((sum, gap) => sum + gap, 0),
                                    testId,
                                    word,
                                    context,
                                    recencyWeight,
                                })
                            }
                        }
                    }
                }
                currentWord = []
            }
            for (const event of finalEvents) {
                if (isTargetableKey(normalizedKey(event.key))) currentWord.push(event)
                else flushHigherOrderWord()
            }
            flushHigherOrderWord()
        }
    })

    // If natural evidence appeared after an earlier diagnostic Timeline in the
    // input, rebuild occurrence counts from natural only (input order is not a
    // persistence contract).
    if (naturalTimelines > 0) {
        frequencyCharacters = 0
        keyFrequency.clear()
        pairFrequency.clear()
        for (const timeline of timelines.filter((item) => item.context === "natural")) {
            const frequency = finalFrequency(decodeEvidenceTimeline(timeline.timeline))
            frequencyCharacters += frequency.characters
            addCounts(keyFrequency, frequency.keys)
            addCounts(pairFrequency, frequency.pairs)
        }
    }

    const usableLatencySamples = arrivals.filter((sample) => discoversWeakness(sample.context)).length
    return {
        arrivals,
        attempts,
        corrections,
        grams,
        words,
        frequencyCharacters,
        keyFrequency,
        pairFrequency,
        gramFrequency,
        wordFrequency,
        drillTargets,
        practiceRuns,
        testCompletedAt,
        quality: {
            status: discoveryTimelines === 0 ? "none" : "thin",
            analyzedTimelines: timelines.length,
            discoveryTimelines,
            naturalTimelines,
            acquisitionTimelines,
            discoveryCharacters,
            usableLatencySamples,
            excludedNonPositiveGaps,
            excludedInterruptionGaps,
            interrupted: excludedInterruptionGaps > 0,
        },
    }
}

function grouped<T>(values: readonly T[], keyFor: (value: T) => string): Map<string, T[]> {
    const result = new Map<string, T[]>()
    for (const value of values) {
        const key = keyFor(value)
        const bucket = result.get(key) ?? []
        bucket.push(value)
        result.set(key, bucket)
    }
    return result
}

function distinct<T>(values: readonly T[]): number {
    return new Set(values).size
}

function confidence(count: number, floor: number, diversity: number, diversityFloor: number): number {
    return clamp01(count / (floor * 2)) * clamp01(diversity / diversityFloor)
}

function sampleRecency(samples: readonly { recencyWeight: number }[]): number {
    return samples.length === 0 ? 1 : mean(samples.map((sample) => sample.recencyWeight))
}

function frequencyPer1000(count: number, characters: number): number {
    return characters <= 0 ? 0 : count / characters * 1_000
}

function accuracyPct<T>(samples: readonly T[], correct: (sample: T) => boolean): number {
    return samples.filter(correct).length / samples.length * 100
}

type TargetSample = { testId: number }

interface TargetSamplePools {
    arrivals: ArrivalSample[]
    attempts: AttemptSample[]
    grams: GramSample[]
    words: WordSample[]
}

// One owner for "which samples measure this Target, and how do they become a
// value" - shared by drill response and natural ability so the two contexts
// can never drift apart in definition. The casts are safe: each branch only
// selects from the pool its valueOf reads.
function targetSamples(
    target: CoachingTarget,
    pools: TargetSamplePools,
): { samples: TargetSample[], valueOf: (subset: readonly TargetSample[]) => number } | null {
    if (target.kind === "key") {
        const keys = new Set(target.keys)
        if (target.metric === "latency") {
            return {
                samples: pools.arrivals.filter((sample) => keys.has(sample.key)),
                valueOf: (subset) => median((subset as readonly ArrivalSample[]).map((sample) => sample.dtMs)),
            }
        }
        return {
            samples: pools.attempts.filter((sample) => keys.has(sample.key)),
            valueOf: (subset) => accuracyPct(subset as readonly AttemptSample[], (sample) => sample.correct),
        }
    }
    if (target.kind === "transition") {
        return {
            samples: pools.arrivals.filter((sample) => sample.pair === target.pair),
            valueOf: (subset) => target.metric === "latency"
                ? median((subset as readonly ArrivalSample[]).map((sample) => sample.dtMs))
                : accuracyPct(subset as readonly ArrivalSample[], (sample) => sample.correct),
        }
    }
    if (target.kind === "correction") {
        return {
            samples: pools.attempts.filter((sample) => sample.key === target.expected),
            valueOf: (subset) => accuracyPct(subset as readonly AttemptSample[], (sample) => !sample.correct && sample.typed === target.typed),
        }
    }
    if (target.kind === "gram") {
        return {
            samples: pools.grams.filter((sample) => sample.gram === target.gram),
            valueOf: (subset) => median((subset as readonly GramSample[]).map((sample) => sample.internalMs)),
        }
    }
    if (target.kind === "word") {
        const words = new Set(target.words)
        return {
            samples: pools.words.filter((sample) => words.has(sample.word)),
            valueOf: (subset) => median((subset as readonly WordSample[]).map((sample) => sample.internalMs / sample.arrivals)),
        }
    }
    if (target.kind === "movement") {
        return {
            samples: pools.arrivals.filter((sample) => sample.movement === target.movement),
            valueOf: (subset) => median((subset as readonly ArrivalSample[]).map((sample) => sample.dtMs)),
        }
    }
    return null
}

function customPracticeContainsTarget(practice: Extract<PracticeRecord, { kind: "custom" }>, target: CoachingTarget): boolean {
    const items = new Set(practice.focus.items)
    if (practice.focus.kind === "keys") {
        if (target.kind === "key") return target.keys.some((key) => items.has(key))
        if (target.kind === "correction") return items.has(target.expected) && items.has(target.typed)
        return false
    }
    if (target.kind === "transition") return items.has(target.pair)
    if (target.kind === "gram") return items.has(target.gram)
    if (target.kind === "word") return target.words.some((word) => items.has(word))
    if (target.kind === "movement") return target.anchors.some((anchor) => items.has(anchor))
    return false
}

function practiceRunMatchesTarget(practice: PracticeRecord, target: CoachingTarget): boolean {
    return practice.kind === "guided"
        ? sameCoachingTarget(practice.target, target)
        : customPracticeContainsTarget(practice, target)
}

function pooled(evidence: PreparedEvidence, include: (sample: { context: EvidenceContext, testId: number }) => boolean): TargetSamplePools {
    return {
        arrivals: evidence.arrivals.filter(include),
        attempts: evidence.attempts.filter(include),
        grams: evidence.grams.filter(include),
        words: evidence.words.filter(include),
    }
}

function acquisitionResponse(
    candidate: Pick<SkillCandidate, "target" | "metric">,
    evidence: PreparedEvidence,
): AcquisitionResponse | undefined {
    // Only runs drilled *for* this Target count as its practice. Without this,
    // any drill whose filler text contained the key attributed its volume and
    // performance to every overlapping Target.
    const drilledTests = new Set([...evidence.drillTargets]
        .filter(([, drilled]) => sameCoachingTarget(drilled, candidate.target))
        .map(([testId]) => testId))
    if (drilledTests.size === 0) return undefined
    const selected = targetSamples(
        candidate.target,
        pooled(evidence, (sample) => sample.context === "acquisition" && drilledTests.has(sample.testId)),
    )
    if (!selected || selected.samples.length === 0) return undefined
    return {
        context: "acquisition",
        value: selected.valueOf(selected.samples),
        sampleCount: selected.samples.length,
        runCount: distinct(selected.samples.map((sample) => sample.testId)),
    }
}

function practiceActivity(target: CoachingTarget, evidence: PreparedEvidence): PracticeActivity | undefined {
    const matching = [...evidence.practiceRuns]
        .filter(([, practice]) => practiceRunMatchesTarget(practice, target))
    if (matching.length === 0) return undefined
    const completedTests = new Set(matching.filter(([, practice]) => practice.completed).map(([testId]) => testId))
    const selected = targetSamples(
        target,
        pooled(evidence, (sample) => completedTests.has(sample.testId) &&
            (sample.context === "acquisition" || sample.context === "custom-practice")),
    )
    const samples = selected?.samples ?? []
    return {
        focusedTimeMs: matching.reduce((sum, [, practice]) => sum + practice.elapsedActivityMs, 0),
        completedRuns: completedTests.size,
        sampleCount: samples.length,
        ...(selected && samples.length > 0 ? { value: selected.valueOf(samples) } : {}),
    }
}

function naturalAbility(target: CoachingTarget, evidence: PreparedEvidence): NaturalAbility | undefined {
    const selected = targetSamples(target, pooled(evidence, (sample) => discoversWeakness(sample.context)))
    if (!selected || selected.samples.length === 0) return undefined
    const { samples, valueOf } = selected
    const ability: NaturalAbility = { value: valueOf(samples), sampleCount: samples.length }
    const tests = [...new Set(samples.map((sample) => sample.testId))]
        .sort((a, b) => (evidence.testCompletedAt.get(a) ?? 0) - (evidence.testCompletedAt.get(b) ?? 0))
    if (tests.length < 2) return ability
    const recentTests = new Set(tests.slice(-SKILL_EVIDENCE_THRESHOLDS.abilityRecentTestWindow))
    const recent = samples.filter((sample) => recentTests.has(sample.testId))
    const earlier = samples.filter((sample) => !recentTests.has(sample.testId))
    const floor = SKILL_EVIDENCE_THRESHOLDS.abilitySplitMinSamplesPerHalf
    if (recent.length >= floor && earlier.length >= floor) {
        ability.split = {
            earlier: valueOf(earlier),
            recent: valueOf(recent),
            earlierSamples: earlier.length,
            recentSamples: recent.length,
        }
    }
    return ability
}

function naturalMeasurementFloor(target: CoachingTarget): number {
    if (target.kind === "key") return target.metric === "accuracy"
        ? SKILL_EVIDENCE_THRESHOLDS.keyAccuracyMinAttempts
        : SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinSamples
    if (target.kind === "transition") return SKILL_EVIDENCE_THRESHOLDS.transitionMinSamples
    if (target.kind === "correction") return SKILL_EVIDENCE_THRESHOLDS.correctionMinErrors
    if (target.kind === "gram") return [...target.gram].length === 4
        ? SKILL_EVIDENCE_THRESHOLDS.tetragramMinSamples
        : SKILL_EVIDENCE_THRESHOLDS.trigramMinSamples
    if (target.kind === "word") return SKILL_EVIDENCE_THRESHOLDS.wordMinSamples
    if (target.kind === "movement") return SKILL_EVIDENCE_THRESHOLDS.movementMinSamples
    return 1
}

// A timer-completed exact Guided record opens the queue. Only enough newer
// ordinary natural Target samples close it; unrelated or too-thin Tests do not.
function awaitingMeasurement(target: CoachingTarget, evidence: PreparedEvidence): boolean {
    let latestDrillAt: number | undefined
    for (const [testId, drilled] of evidence.drillTargets) {
        if (!sameCoachingTarget(drilled, target)) continue
        const at = evidence.testCompletedAt.get(testId) ?? 0
        if (latestDrillAt === undefined || at > latestDrillAt) latestDrillAt = at
    }
    if (latestDrillAt === undefined) return false
    const selected = targetSamples(target, pooled(evidence, (sample) =>
        sample.context === "natural" && (evidence.testCompletedAt.get(sample.testId) ?? 0) > latestDrillAt!,
    ))
    return (selected?.samples.length ?? 0) < naturalMeasurementFloor(target)
}

function createCandidate(
    candidate: Omit<SkillCandidate, "response">,
    evidence: PreparedEvidence,
): SkillCandidate | null {
    if (candidate.impactMsPer1000 < SKILL_EVIDENCE_THRESHOLDS.materialImpactMsPer1000) return null
    const response = acquisitionResponse(candidate, evidence)
    return { ...candidate, ...(response ? { response } : {}) }
}

function stableCandidateSort(a: SkillCandidate, b: SkillCandidate): number {
    return b.impactMsPer1000 - a.impactMsPer1000
        || b.frequencyPer1000 - a.frequencyPer1000
        || b.confidence - a.confidence
        || a.id.localeCompare(b.id)
}

interface CorpusPriors {
    characters: number
    grams: Map<string, number>
    words: Map<string, number>
}

function corpusPriors(rawWords: readonly string[]): CorpusPriors {
    const grams = new Map<string, number>()
    const words = new Map<string, number>()
    let characters = 0
    // Bundled lists are frequency-ranked. The first 1,000 words provide a
    // bounded common-language prior without pulling candidate generation over
    // tens of thousands of entries on every result render.
    for (const raw of rawWords.slice(0, 1_000)) {
        const word = raw.trim().toLocaleLowerCase()
        if (!/^\p{L}{2,}$/u.test(word)) continue
        characters += [...word].length
        addHigherOrderFrequency(word, grams, words)
    }
    return { characters, grams, words }
}

function priorFrequency(
    id: string,
    natural: ReadonlyMap<string, number>,
    naturalCharacters: number,
    corpus: ReadonlyMap<string, number>,
    corpusCharacters: number,
): number {
    if (naturalCharacters >= SKILL_EVIDENCE_THRESHOLDS.naturalFrequencyMinCharacters) {
        return frequencyPer1000(natural.get(id) ?? 0, naturalCharacters)
    }
    const corpusCount = corpus.get(id) ?? 0
    return corpusCount > 0
        ? frequencyPer1000(corpusCount, corpusCharacters)
        : frequencyPer1000(natural.get(id) ?? 0, naturalCharacters)
}

function rankedCarrierWords(samples: readonly GramSample[]): string[] {
    const counts = new Map<string, number>()
    for (const sample of samples) counts.set(sample.word, (counts.get(sample.word) ?? 0) + 1)
    return [...counts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, SKILL_EVIDENCE_THRESHOLDS.maxTargetWords)
        .map(([word]) => word)
}

interface HardWordProfile {
    word: string
    samples: WordSample[]
    observedMs: number
    excessMs: number
    frequencyPer1000: number
    confidence: number
    recencyWeight: number
    impactMsPer1000: number
}

function higherOrderCandidates(
    evidence: PreparedEvidence,
    baselineMs: number,
    rawCorpusWords: readonly string[],
): SkillCandidate[] {
    const naturalGrams = evidence.grams.filter((sample) => sample.context === "natural")
    const naturalWords = evidence.words.filter((sample) => sample.context === "natural")
    if (baselineMs <= 0 || naturalGrams.length === 0) return []
    const priors = corpusPriors(rawCorpusWords)
    const candidates: SkillCandidate[] = []
    const gramsByValue = grouped(naturalGrams, (sample) => sample.gram)

    for (const size of [3, 4]) {
        const floor = size === 3
            ? {
                samples: SKILL_EVIDENCE_THRESHOLDS.trigramMinSamples,
                tests: SKILL_EVIDENCE_THRESHOLDS.trigramMinTests,
                words: SKILL_EVIDENCE_THRESHOLDS.trigramMinWords,
            }
            : {
                samples: SKILL_EVIDENCE_THRESHOLDS.tetragramMinSamples,
                tests: SKILL_EVIDENCE_THRESHOLDS.tetragramMinTests,
                words: SKILL_EVIDENCE_THRESHOLDS.tetragramMinWords,
            }
        const sized: SkillCandidate[] = []
        for (const [gram, samples] of gramsByValue) {
            if ([...gram].length !== size || samples.length < floor.samples) continue
            const tests = distinct(samples.map((sample) => sample.testId))
            const words = distinct(samples.map((sample) => sample.word))
            if (tests < floor.tests || words < floor.words) continue

            const observedMs = median(samples.map((sample) => sample.internalMs))
            const gramBaselineMs = baselineMs * (size - 1)
            const excessMs = observedMs - gramBaselineMs
            if (
                excessMs < SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs ||
                observedMs / gramBaselineMs < SKILL_EVIDENCE_THRESHOLDS.higherOrderLatencyMinRatio
            ) continue

            const candidateConfidence = clamp01(samples.length / (floor.samples * 2))
                * Math.min(clamp01(tests / floor.tests), clamp01(words / floor.words))
            if (candidateConfidence <= 0) continue
            const frequency = priorFrequency(
                gram,
                evidence.gramFrequency,
                evidence.frequencyCharacters,
                priors.grams,
                priors.characters,
            )
            const recencyWeight = sampleRecency(samples)
            const candidate = createCandidate({
                id: `gram:${size}:${gram}`,
                target: { kind: "gram", gram },
                metric: "ms",
                direction: "lower",
                observed: observedMs,
                baseline: gramBaselineMs,
                sampleCount: samples.length,
                distinctTests: tests,
                distinctWords: words,
                frequencyPer1000: frequency,
                confidence: candidateConfidence,
                recencyWeight,
                impactMsPer1000: excessMs * frequency * candidateConfidence * recencyWeight,
                reason: {
                    code: "gram_internal_latency_high",
                    gram,
                    observedMs,
                    baselineMs: gramBaselineMs,
                    excessMs,
                    carrierWords: rankedCarrierWords(samples),
                },
            }, evidence)
            if (candidate) sized.push(candidate)
        }
        sized.sort(stableCandidateSort)
        candidates.push(...sized.slice(0, SKILL_EVIDENCE_THRESHOLDS.maxGramCandidatesPerSize))
    }

    const hardWords: HardWordProfile[] = []
    for (const [word, samples] of grouped(naturalWords, (sample) => sample.word)) {
        if (samples.length < SKILL_EVIDENCE_THRESHOLDS.wordMinSamples) continue
        const tests = distinct(samples.map((sample) => sample.testId))
        if (tests < SKILL_EVIDENCE_THRESHOLDS.wordMinTests) continue
        const observedMs = median(samples.map((sample) => sample.internalMs / sample.arrivals))
        const excessMs = median(samples.map((sample) => sample.internalMs - baselineMs * sample.arrivals))
        if (
            observedMs - baselineMs < SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs ||
            observedMs / baselineMs < SKILL_EVIDENCE_THRESHOLDS.higherOrderLatencyMinRatio
        ) continue
        const candidateConfidence = confidence(
            samples.length,
            SKILL_EVIDENCE_THRESHOLDS.wordMinSamples,
            tests,
            SKILL_EVIDENCE_THRESHOLDS.wordMinTests,
        )
        const frequency = priorFrequency(
            word,
            evidence.wordFrequency,
            evidence.frequencyCharacters,
            priors.words,
            priors.characters,
        )
        const recencyWeight = sampleRecency(samples)
        hardWords.push({
            word,
            samples,
            observedMs,
            excessMs,
            frequencyPer1000: frequency,
            confidence: candidateConfidence,
            recencyWeight,
            impactMsPer1000: excessMs * frequency * candidateConfidence * recencyWeight,
        })
    }

    const wordCandidates: SkillCandidate[] = []
    for (const profile of hardWords) {
        const tests = distinct(profile.samples.map((sample) => sample.testId))
        const candidate = createCandidate({
            id: `word:${profile.word}`,
            target: { kind: "word", words: [profile.word] },
            metric: "ms",
            direction: "lower",
            observed: profile.observedMs,
            baseline: baselineMs,
            sampleCount: profile.samples.length,
            distinctTests: tests,
            distinctWords: 1,
            frequencyPer1000: profile.frequencyPer1000,
            confidence: profile.confidence,
            recencyWeight: profile.recencyWeight,
            impactMsPer1000: profile.impactMsPer1000,
            reason: {
                code: "word_internal_latency_high",
                words: [profile.word],
                observedMs: profile.observedMs,
                baselineMs,
            },
        }, evidence)
        if (candidate) wordCandidates.push(candidate)
    }

    const profilesByGram = new Map<string, HardWordProfile[]>()
    for (const profile of hardWords) {
        const characters = [...profile.word]
        const seen = new Set<string>()
        for (const size of [3, 4]) {
            for (let index = 0; index + size <= characters.length; index += 1) {
                seen.add(characters.slice(index, index + size).join(""))
            }
        }
        for (const gram of seen) {
            const family = profilesByGram.get(gram) ?? []
            family.push(profile)
            profilesByGram.set(gram, family)
        }
    }
    for (const [sharedGram, profiles] of profilesByGram) {
        if (profiles.length < 2) continue
        const ordered = [...profiles].sort((a, b) => b.impactMsPer1000 - a.impactMsPer1000 || a.word.localeCompare(b.word))
        const targetWords = ordered.slice(0, SKILL_EVIDENCE_THRESHOLDS.maxTargetWords).map((profile) => profile.word)
        const samples = ordered.flatMap((profile) => profile.samples)
        const tests = distinct(samples.map((sample) => sample.testId))
        const observedMs = median(samples.map((sample) => sample.internalMs / sample.arrivals))
        const excessMs = median(samples.map((sample) => sample.internalMs - baselineMs * sample.arrivals))
        const candidateConfidence = confidence(
            samples.length,
            SKILL_EVIDENCE_THRESHOLDS.wordMinSamples,
            tests,
            SKILL_EVIDENCE_THRESHOLDS.wordMinTests,
        ) * clamp01(targetWords.length / 2)
        const frequency = ordered.reduce((sum, profile) => sum + profile.frequencyPer1000, 0)
        const recencyWeight = sampleRecency(samples)
        const candidate = createCandidate({
            id: `word:family:${sharedGram}`,
            target: { kind: "word", words: targetWords, sharedGram },
            metric: "ms",
            direction: "lower",
            observed: observedMs,
            baseline: baselineMs,
            sampleCount: samples.length,
            distinctTests: tests,
            distinctWords: targetWords.length,
            frequencyPer1000: frequency,
            confidence: candidateConfidence,
            recencyWeight,
            impactMsPer1000: excessMs * frequency * candidateConfidence * recencyWeight,
            reason: {
                code: "word_internal_latency_high",
                words: targetWords,
                observedMs,
                baselineMs,
                sharedGram,
            },
        }, evidence)
        if (candidate) wordCandidates.push(candidate)
    }
    wordCandidates.sort(stableCandidateSort)
    candidates.push(...wordCandidates.slice(0, SKILL_EVIDENCE_THRESHOLDS.maxWordCandidates))
    return candidates
}

interface NaturalRunSample {
    testId: number
    count: number
    mode: number
    subMode: number
    options: string
    punctuation: boolean
    capitals: boolean
    numbers: boolean
    language: string
    pool: string
    netWpm: number
}

function naturalRunSamples(timelines: readonly TimelineEvidence[]): NaturalRunSample[] {
    const runs: NaturalRunSample[] = []
    timelines.forEach((timeline, testId) => {
        if (timeline.context !== "natural" || timeline.mode !== 0) return
        const durationSeconds = timeline.subMode === 0
            ? timeline.count
            : timelineDurationMs(timeline.timeline) / 1_000
        if (durationSeconds <= 0) return
        const netWpm = evaluateTestEvidence({
            timeline: timeline.timeline,
            durationSeconds,
            eligibleForRanking: false,
        }).netWpm
        if (!Number.isFinite(netWpm) || netWpm <= 0) return
        runs.push({
            testId,
            count: timeline.count,
            mode: timeline.mode,
            subMode: timeline.subMode,
            options: timeline.options,
            punctuation: timeline.punctuation,
            capitals: timeline.capitals,
            numbers: timeline.numbers,
            language: timeline.language,
            pool: timeline.pool,
            netWpm,
        })
    })
    return runs
}

function runFamilyKey(run: NaturalRunSample, omitted?: TestFamilyCost["kind"] | "count"): string {
    return JSON.stringify([
        run.language,
        run.pool,
        run.mode,
        run.subMode,
        omitted === "count" ? null : run.count,
        run.options,
        omitted === "punctuation" ? null : run.punctuation,
        omitted === "capitals" ? null : run.capitals,
        omitted === "numbers" ? null : run.numbers,
    ])
}

function matchedRunEvidence(timelines: readonly TimelineEvidence[], evidence: PreparedEvidence): {
    candidates: SkillCandidate[]
    testFamilyCosts: TestFamilyCost[]
} {
    const runs = naturalRunSamples(timelines)
    const candidates: SkillCandidate[] = []
    const enduranceFamilies = grouped(
        runs.filter((run) => run.subMode === 0),
        (run) => runFamilyKey(run, "count"),
    )
    for (const family of enduranceFamilies.values()) {
        const bySeconds = grouped(family, (run) => String(run.count))
        const shortLengths = [...bySeconds.keys()].map(Number).filter((seconds) => seconds <= SKILL_EVIDENCE_THRESHOLDS.enduranceShortMaxSeconds)
        const longLengths = [...bySeconds.keys()].map(Number).filter((seconds) => seconds >= SKILL_EVIDENCE_THRESHOLDS.enduranceLongMinSeconds)
        for (const shortSeconds of shortLengths) {
            const short = bySeconds.get(String(shortSeconds)) ?? []
            if (short.length < SKILL_EVIDENCE_THRESHOLDS.enduranceMinTestsPerLength) continue
            for (const longSeconds of longLengths) {
                const long = bySeconds.get(String(longSeconds)) ?? []
                if (long.length < SKILL_EVIDENCE_THRESHOLDS.enduranceMinTestsPerLength) continue
                const shortWpm = median(short.map((run) => run.netWpm))
                const longWpm = median(long.map((run) => run.netWpm))
                const gapWpm = shortWpm - longWpm
                if (gapWpm < SKILL_EVIDENCE_THRESHOLDS.enduranceMinGapWpm || longWpm <= 0) continue
                const candidateConfidence = clamp01(Math.min(short.length, long.length) / (SKILL_EVIDENCE_THRESHOLDS.enduranceMinTestsPerLength * 2))
                const impactMsPer1000 = (12_000_000 / longWpm - 12_000_000 / shortWpm) * candidateConfidence
                const candidate = createCandidate({
                    id: `endurance:${shortSeconds}:${longSeconds}:${runFamilyKey(short[0]!, "count")}`,
                    target: { kind: "endurance", shortSeconds, longSeconds },
                    metric: "wpm",
                    direction: "higher",
                    observed: longWpm,
                    baseline: shortWpm,
                    sampleCount: short.length + long.length,
                    distinctTests: distinct([...short, ...long].map((run) => run.testId)),
                    distinctWords: 0,
                    frequencyPer1000: 1,
                    confidence: candidateConfidence,
                    recencyWeight: 1,
                    impactMsPer1000,
                    reason: { code: "endurance_fade", shortSeconds, longSeconds, shortWpm, longWpm, gapWpm },
                }, evidence)
                if (candidate) candidates.push(candidate)
            }
        }
    }

    const testFamilyCosts: TestFamilyCost[] = []
    for (const kind of ["punctuation", "capitals", "numbers"] as const) {
        const families = grouped(runs, (run) => runFamilyKey(run, kind))
        for (const family of families.values()) {
            const baseline = family.filter((run) => !run[kind])
            const enabled = family.filter((run) => run[kind])
            if (
                baseline.length < SKILL_EVIDENCE_THRESHOLDS.optionCostMinTests ||
                enabled.length < SKILL_EVIDENCE_THRESHOLDS.optionCostMinTests
            ) continue
            const baselineWpm = median(baseline.map((run) => run.netWpm))
            const enabledWpm = median(enabled.map((run) => run.netWpm))
            const gapWpm = baselineWpm - enabledWpm
            if (gapWpm < SKILL_EVIDENCE_THRESHOLDS.optionCostMinGapWpm) continue
            testFamilyCosts.push({
                kind,
                baselineWpm,
                enabledWpm,
                gapWpm,
                baselineTests: baseline.length,
                enabledTests: enabled.length,
            })
        }
    }
    testFamilyCosts.sort((a, b) => b.gapWpm - a.gapWpm || a.kind.localeCompare(b.kind))
    return { candidates, testFamilyCosts }
}

function movementCandidates(evidence: PreparedEvidence, arrivals: readonly ArrivalSample[], baselineMs: number): SkillCandidate[] {
    if (baselineMs <= 0) return []
    const candidates: SkillCandidate[] = []
    const byMovement = grouped(arrivals.filter((sample) => sample.movement !== null), (sample) => sample.movement!)
    for (const [rawMovement, samples] of byMovement) {
        const movement = rawMovement as MovementKind
        const sequences = grouped(samples, (sample) => sample.sequence)
        if (
            samples.length < SKILL_EVIDENCE_THRESHOLDS.movementMinSamples ||
            sequences.size < SKILL_EVIDENCE_THRESHOLDS.movementMinSequences
        ) continue
        const observedMs = median(samples.map((sample) => sample.dtMs))
        if (
            observedMs - baselineMs < SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs ||
            observedMs / baselineMs < SKILL_EVIDENCE_THRESHOLDS.transitionLatencyMinRatio
        ) continue
        const anchors = [...sequences]
            .sort((a, b) => median(b[1].map((sample) => sample.dtMs)) - median(a[1].map((sample) => sample.dtMs)) || a[0].localeCompare(b[0]))
            .slice(0, SKILL_EVIDENCE_THRESHOLDS.maxTargetWords)
            .map(([sequence]) => sequence)
        const candidateConfidence = confidence(
            samples.length,
            SKILL_EVIDENCE_THRESHOLDS.movementMinSamples,
            sequences.size,
            SKILL_EVIDENCE_THRESHOLDS.movementMinSequences,
        )
        const naturalSamples = samples.filter((sample) => sample.context === "natural")
        const frequency = frequencyPer1000(naturalSamples.length || samples.length, evidence.frequencyCharacters)
        const recencyWeight = sampleRecency(samples)
        const candidate = createCandidate({
            id: `movement:${movement}`,
            target: { kind: "movement", movement, anchors },
            metric: "ms",
            direction: "lower",
            observed: observedMs,
            baseline: baselineMs,
            sampleCount: samples.length,
            distinctTests: distinct(samples.map((sample) => sample.testId)),
            distinctWords: distinct(samples.map((sample) => sample.word).filter(Boolean)),
            frequencyPer1000: frequency,
            confidence: candidateConfidence,
            recencyWeight,
            impactMsPer1000: (observedMs - baselineMs) * frequency * candidateConfidence * recencyWeight,
            reason: { code: "movement_latency_high", movement, observedMs, baselineMs, anchors },
        }, evidence)
        if (candidate) candidates.push(candidate)
    }
    return candidates
}

function completedCoachingSets(session: DailyCoachingSession): number {
    return session.steps.reduce((sum, step) => sum + step.sets.length, 0)
}

function bestStepValue(
    session: DailyCoachingSession,
    kind: "focus" | "transfer",
): { value: number, samples: number, improved: boolean } | null {
    const step = session.steps.find((item) => item.kind === kind)
    const deltas = step?.sets.flatMap((set) => set.targetDelta
        ? [{ delta: set.targetDelta, samples: set.targetSamples ?? 0 }]
        : []) ?? []
    if (deltas.length === 0) return null
    const direction = session.prescription?.direction ?? (deltas[0]!.delta.unit === "ms" ? "lower" : "higher")
    const best = deltas.reduce((current, next) => direction === "lower"
        ? (next.delta.after < current.delta.after ? next : current)
        : (next.delta.after > current.delta.after ? next : current))
    return { value: best.delta.after, samples: best.samples, improved: best.delta.improved }
}

function heldAgainstFrozenBaseline(session: DailyCoachingSession): { value: number, samples: number, held: boolean } | null {
    const expected = session.yesterday
    const step = session.steps.find((item) => item.kind === "recheck")
    const set = step?.sets.find((item) => item.targetDelta)
    const delta = set?.targetDelta
    if (!expected || !delta || delta.unit !== expected.unit) return null
    const held = expected.unit === "ms"
        ? delta.after <= expected.before - expected.minimumChange
        : delta.after >= expected.before + expected.minimumChange
    return { value: delta.after, samples: set?.targetSamples ?? 0, held }
}

function recordTargetKey(record: Pick<MasteryRecord, "target">): string {
    return JSON.stringify(record.target)
}

function deriveMastery(
    sessions: readonly DailyCoachingSession[],
    candidates: readonly SkillCandidate[],
    todayDateKey: string | undefined,
): { mastery: MasteryRecord[], recap: SkillRecap } {
    const ordered = [...sessions]
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.createdAt - b.createdAt)
    const records: MasteryRecord[] = []

    for (const session of ordered) {
        const prescription = session.prescription
        if (prescription) {
            const acquisition = bestStepValue(session, "focus")
            const focus = session.steps.find((step) => step.kind === "focus")
            const transfer = bestStepValue(session, "transfer")
            records.push({
                id: `${session.id}:${prescription.id}`,
                target: prescription.target,
                state: transfer?.improved ? "transferred" : "training",
                prescription,
                proof: {
                    target: prescription.target,
                    metric: prescription.metric,
                    baseline: prescription.baseline,
                    ...(acquisition ? { bestAcquisition: acquisition.value } : {}),
                    ...(transfer ? { transfer: transfer.value } : {}),
                    improvedInTransfer: transfer?.improved ?? false,
                    heldCold: null,
                    sampleCounts: {
                        baseline: prescription.sampleCount,
                        transfer: transfer?.samples ?? 0,
                        cold: 0,
                    },
                },
                prescribedDate: session.dateKey,
                lastEvidenceDate: transfer ? session.dateKey : session.dateKey,
                heldColdChecks: 0,
                practicedDaysUntilDue: transfer?.improved ? 1 : null,
                practiceSets: focus?.sets.length ?? 0,
                practiceSamples: focus?.sets.reduce((sum, set) => sum + (set.targetSamples ?? 0), 0) ?? 0,
            })
        }

        const cold = heldAgainstFrozenBaseline(session)
        const coldTarget = session.yesterday?.target
        if (!cold || !coldTarget) continue
        // A delayed check belongs to the newest earlier episode for this Target.
        // Same-day focused work can never manufacture retained state.
        const record = [...records].reverse().find((item) =>
            item.prescribedDate < session.dateKey &&
            item.proof.improvedInTransfer &&
            sameCoachingTarget(item.target, coldTarget),
        )
        if (!record) continue
        record.proof.cold = cold.value
        record.proof.heldCold = cold.held
        record.proof.sampleCounts.cold = cold.samples
        record.lastEvidenceDate = session.dateKey
        if (cold.held) {
            record.heldColdChecks += 1
            record.state = "retained"
            record.practicedDaysUntilDue = record.heldColdChecks === 1
                ? MASTERY_CHECK_INTERVALS.afterFirstHeldPracticedDays
                : MASTERY_CHECK_INTERVALS.afterLaterHeldPracticedDays
        } else {
            record.state = "regressed"
            record.practicedDaysUntilDue = null
        }
    }

    const practicedDates = [...new Set(ordered
        .filter((session) => completedCoachingSets(session) > 0)
        .map((session) => session.dateKey))]
    const latestByTarget = new Map<string, MasteryRecord>()
    for (const record of records) latestByTarget.set(recordTargetKey(record), record)

    for (const record of latestByTarget.values()) {
        if (record.state === "transferred" && todayDateKey && todayDateKey > record.lastEvidenceDate) {
            record.state = "due"
            record.practicedDaysUntilDue = 0
        } else if (record.state === "retained" && record.practicedDaysUntilDue) {
            const interval = record.practicedDaysUntilDue
            const completedAfter = practicedDates.filter((date) => date > record.lastEvidenceDate && (!todayDateKey || date < todayDateKey)).length
            // The upcoming session is itself the next practiced day. A 3-day
            // interval is therefore due after two intervening practiced days.
            const remaining = Math.max(0, interval - completedAfter - 1)
            record.practicedDaysUntilDue = remaining
            if (remaining === 0) record.state = "due"
        }

        if ((record.state === "retained" || (record.state === "due" && record.heldColdChecks > 0)) &&
            candidates.some((candidate) => sameCoachingTarget(candidate.target, record.target))) {
            record.state = "regressed"
            record.practicedDaysUntilDue = null
        }
    }

    const mastery = records.sort((a, b) =>
        b.prescribedDate.localeCompare(a.prescribedDate) || b.id.localeCompare(a.id))
    const due = mastery.filter((record) => record.state === "due")
        .sort((a, b) => a.lastEvidenceDate.localeCompare(b.lastEvidenceDate) ||
            b.prescription.impactMsPer1000 - a.prescription.impactMsPer1000 || a.id.localeCompare(b.id))[0] ?? null
    const candidateRank = (record: MasteryRecord) => {
        const index = candidates.findIndex((candidate) => sameCoachingTarget(candidate.target, record.target))
        return index < 0 ? Number.MAX_SAFE_INTEGER : index
    }
    const regressed = mastery.filter((record) => record.state === "regressed")
        .sort((a, b) => candidateRank(a) - candidateRank(b) ||
            b.prescription.impactMsPer1000 - a.prescription.impactMsPer1000 || a.id.localeCompare(b.id))[0] ?? null
    return {
        mastery,
        recap: { retained: mastery.filter((record) => record.state === "retained"), due, regressed },
    }
}

export function analyzeTypingEvidence(input: SkillEvidenceInput): SkillAnalysis {
    const evidence = prepareEvidence(input.timelines)
    const discoveryArrivals = evidence.arrivals.filter((sample) => discoversWeakness(sample.context))
    const discoveryAttempts = evidence.attempts.filter((sample) => discoversWeakness(sample.context))
    const discoveryCorrections = evidence.corrections.filter((sample) => discoversWeakness(sample.context))
    const naturalArrivals = discoveryArrivals.filter((sample) => sample.context === "natural")
    const baselineSamples = naturalArrivals.length > 0 ? naturalArrivals : discoveryArrivals
    const baselineMs = median(baselineSamples.map((sample) => sample.dtMs))
    const personalCorrectionCostMs = discoveryCorrections.length > 0
        ? median(discoveryCorrections.map((sample) => sample.costMs))
        : baselineMs * SKILL_EVIDENCE_THRESHOLDS.correctionFallbackLatencyMultiplier
    const candidates: SkillCandidate[] = []
    const matchedRuns = matchedRunEvidence(input.timelines, evidence)

    candidates.push(...higherOrderCandidates(evidence, baselineMs, input.corpusWords ?? []))
    candidates.push(...movementCandidates(evidence, discoveryArrivals, baselineMs))
    candidates.push(...matchedRuns.candidates)

    const arrivalsByKey = grouped(discoveryArrivals.filter((sample) => isTargetableKey(sample.key)), (sample) => sample.key)
    const attemptsByKey = grouped(discoveryAttempts.filter((sample) => isTargetableKey(sample.key)), (sample) => sample.key)
    for (const [key, samples] of arrivalsByKey) {
        const observedMs = median(samples.map((sample) => sample.dtMs))
        const predecessors = distinct(samples.map((sample) => sample.predecessor))
        if (
            baselineMs > 0 && samples.length >= SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinSamples &&
            predecessors >= SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinPredecessors &&
            observedMs - baselineMs >= SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs &&
            observedMs / baselineMs >= SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinRatio
        ) {
            const frequency = frequencyPer1000(evidence.keyFrequency.get(key) ?? 0, evidence.frequencyCharacters)
            const candidateConfidence = confidence(samples.length, SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinSamples, predecessors, SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinPredecessors)
            const recencyWeight = sampleRecency(samples)
            const rawImpact = (observedMs - baselineMs) * frequency
            const candidate = createCandidate({
                id: `key:latency:${key}`,
                target: { kind: "key", keys: [key], metric: "latency" },
                metric: "ms",
                direction: "lower",
                observed: observedMs,
                baseline: baselineMs,
                sampleCount: samples.length,
                distinctTests: distinct(samples.map((sample) => sample.testId)),
                distinctWords: distinct(samples.map((sample) => sample.word).filter(Boolean)),
                frequencyPer1000: frequency,
                confidence: candidateConfidence,
                recencyWeight,
                impactMsPer1000: rawImpact * candidateConfidence * recencyWeight,
                reason: { code: "key_latency_above_baseline", key, observedMs, baselineMs, ratio: observedMs / baselineMs },
            }, evidence)
            if (candidate) candidates.push(candidate)
        }
    }

    for (const [key, samples] of attemptsByKey) {
        const tests = distinct(samples.map((sample) => sample.testId))
        const diagnostic = samples.some((sample) => sample.context === "diagnostic")
        const correct = samples.filter((sample) => sample.correct).length
        const accuracyPct = correct / samples.length * 100
        if (
            samples.length >= SKILL_EVIDENCE_THRESHOLDS.keyAccuracyMinAttempts &&
            (tests >= 2 || diagnostic) && accuracyPct < SKILL_EVIDENCE_THRESHOLDS.keyAccuracyFloorPct
        ) {
            const errorRate = 1 - correct / samples.length
            const frequency = frequencyPer1000(evidence.keyFrequency.get(key) ?? 0, evidence.frequencyCharacters)
            const candidateConfidence = confidence(samples.length, SKILL_EVIDENCE_THRESHOLDS.keyAccuracyMinAttempts, tests, diagnostic ? 1 : 2)
            const recencyWeight = sampleRecency(samples)
            const rawImpact = errorRate * personalCorrectionCostMs * frequency
            const candidate = createCandidate({
                id: `key:accuracy:${key}`,
                target: { kind: "key", keys: [key], metric: "accuracy" },
                metric: "%",
                direction: "higher",
                observed: accuracyPct,
                baseline: SKILL_EVIDENCE_THRESHOLDS.keyAccuracyFloorPct,
                sampleCount: samples.length,
                distinctTests: tests,
                distinctWords: 0,
                frequencyPer1000: frequency,
                confidence: candidateConfidence,
                recencyWeight,
                impactMsPer1000: rawImpact * candidateConfidence * recencyWeight,
                reason: { code: "key_accuracy_below_threshold", key, accuracyPct, errorRatePct: errorRate * 100 },
            }, evidence)
            if (candidate) candidates.push(candidate)
        }
    }

    const arrivalsByPair = grouped(discoveryArrivals.filter((sample) => sample.pair !== null), (sample) => sample.pair!)
    for (const [pair, samples] of arrivalsByPair) {
        const tests = distinct(samples.map((sample) => sample.testId))
        const words = distinct(samples.map((sample) => sample.word).filter(Boolean))
        const diagnostic = samples.some((sample) => sample.context === "diagnostic")
        const diverse = tests >= SKILL_EVIDENCE_THRESHOLDS.transitionMinTests || words >= SKILL_EVIDENCE_THRESHOLDS.transitionMinWords || diagnostic
        if (samples.length < SKILL_EVIDENCE_THRESHOLDS.transitionMinSamples || !diverse) continue
        const diversityScore = Math.max(
            tests / SKILL_EVIDENCE_THRESHOLDS.transitionMinTests,
            words / SKILL_EVIDENCE_THRESHOLDS.transitionMinWords,
            diagnostic ? 1 : 0,
        )
        const candidateConfidence = clamp01(samples.length / (SKILL_EVIDENCE_THRESHOLDS.transitionMinSamples * 2)) * clamp01(diversityScore)
        const frequency = frequencyPer1000(evidence.pairFrequency.get(pair) ?? 0, evidence.frequencyCharacters)
        const recencyWeight = sampleRecency(samples)
        const observedMs = median(samples.map((sample) => sample.dtMs))
        const errors = samples.filter((sample) => !sample.correct).length
        const errorRate = errors / samples.length

        if (
            baselineMs > 0 && observedMs - baselineMs >= SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs &&
            observedMs / baselineMs >= SKILL_EVIDENCE_THRESHOLDS.transitionLatencyMinRatio
        ) {
            const rawImpact = ((observedMs - baselineMs) + errorRate * personalCorrectionCostMs) * frequency
            const candidate = createCandidate({
                id: `transition:latency:${pair}`,
                target: { kind: "transition", pair, metric: "latency" },
                metric: "ms",
                direction: "lower",
                observed: observedMs,
                baseline: baselineMs,
                sampleCount: samples.length,
                distinctTests: tests,
                distinctWords: words,
                frequencyPer1000: frequency,
                confidence: candidateConfidence,
                recencyWeight,
                impactMsPer1000: rawImpact * candidateConfidence * recencyWeight,
                reason: { code: "transition_latency_above_baseline", pair, observedMs, baselineMs, ratio: observedMs / baselineMs },
            }, evidence)
            if (candidate) candidates.push(candidate)
        }

        if (errorRate * 100 >= SKILL_EVIDENCE_THRESHOLDS.transitionErrorRateFloorPct) {
            const rawImpact = errorRate * personalCorrectionCostMs * frequency
            const accuracyPct = (1 - errorRate) * 100
            const candidate = createCandidate({
                id: `transition:accuracy:${pair}`,
                target: { kind: "transition", pair, metric: "accuracy" },
                metric: "%",
                direction: "higher",
                observed: accuracyPct,
                baseline: 100 - SKILL_EVIDENCE_THRESHOLDS.transitionErrorRateFloorPct,
                sampleCount: samples.length,
                distinctTests: tests,
                distinctWords: words,
                frequencyPer1000: frequency,
                confidence: candidateConfidence,
                recencyWeight,
                impactMsPer1000: rawImpact * candidateConfidence * recencyWeight,
                reason: { code: "transition_error_rate_high", pair, accuracyPct, errorRatePct: errorRate * 100 },
            }, evidence)
            if (candidate) candidates.push(candidate)
        }
    }

    const correctionsByConfusion = grouped(discoveryCorrections, (sample) => `${sample.expected}\u0000${sample.typed}`)
    for (const samples of correctionsByConfusion.values()) {
        const first = samples[0]!
        const tests = distinct(samples.map((sample) => sample.testId))
        const diagnostic = samples.some((sample) => sample.context === "diagnostic")
        if (
            samples.length < SKILL_EVIDENCE_THRESHOLDS.correctionMinErrors ||
            (tests < SKILL_EVIDENCE_THRESHOLDS.correctionMinTests && !diagnostic)
        ) continue
        const keyOccurrences = evidence.keyFrequency.get(first.expected) ?? 0
        if (keyOccurrences <= 0) continue
        const frequency = frequencyPer1000(keyOccurrences, evidence.frequencyCharacters)
        const errorRate = Math.min(1, samples.length / keyOccurrences)
        const candidateConfidence = confidence(samples.length, SKILL_EVIDENCE_THRESHOLDS.correctionMinErrors, tests, diagnostic ? 1 : SKILL_EVIDENCE_THRESHOLDS.correctionMinTests)
        const recencyWeight = sampleRecency(samples)
        const rawImpact = errorRate * median(samples.map((sample) => sample.costMs)) * frequency
        const candidate = createCandidate({
            id: `correction:${first.expected}:${first.typed}`,
            target: { kind: "correction", expected: first.expected, typed: first.typed },
            metric: "%",
            direction: "lower",
            observed: errorRate * 100,
            baseline: 0,
            sampleCount: samples.length,
            distinctTests: tests,
            distinctWords: 0,
            frequencyPer1000: frequency,
            confidence: candidateConfidence,
            recencyWeight,
            impactMsPer1000: rawImpact * candidateConfidence * recencyWeight,
            reason: {
                code: "correction_confusion_recurs",
                expected: first.expected,
                typed: first.typed,
                errors: samples.length,
                errorRatePct: errorRate * 100,
            },
        }, evidence)
        if (candidate) candidates.push(candidate)
    }

    candidates.sort(stableCandidateSort)
    for (const candidate of candidates) {
        const ability = naturalAbility(candidate.target, evidence)
        if (ability) candidate.ability = ability
        const practice = practiceActivity(candidate.target, evidence)
        if (practice) candidate.practice = practice
        if (awaitingMeasurement(candidate.target, evidence)) candidate.awaitingMeasurement = true
    }
    const scope = input.scope
    const scopedSessions = scope
        ? (input.sessions ?? []).filter((session) => session.language === scope.language && session.pool === scope.pool)
        : input.sessions ?? []
    const history = deriveMastery(scopedSessions, candidates, input.todayDateKey)
    for (const record of history.mastery) {
        const response = acquisitionResponse({ target: record.target, metric: record.proof.metric }, evidence)
        if (response) record.response = response
        const ability = naturalAbility(record.target, evidence)
        if (ability) record.ability = ability
        const practice = practiceActivity(record.target, evidence)
        if (practice) record.practice = practice
        if (awaitingMeasurement(record.target, evidence)) record.awaitingMeasurement = true
    }
    evidence.quality.status = evidence.quality.discoveryTimelines === 0
        ? "none"
        : candidates.length > 0 ? "ready" : "thin"
    const discoveryTimes = input.timelines
        .filter((timeline) => discoversWeakness(timeline.context))
        .map((timeline) => timeline.completedAt)
    return {
        quality: evidence.quality,
        candidates,
        recommendation: candidates[0] ?? null,
        mastery: history.mastery,
        recap: history.recap,
        testFamilyCosts: matchedRuns.testFamilyCosts,
        evidenceWindow: discoveryTimes.length > 0
            ? { tests: discoveryTimes.length, fromMs: Math.min(...discoveryTimes), toMs: Math.max(...discoveryTimes) }
            : null,
    }
}
