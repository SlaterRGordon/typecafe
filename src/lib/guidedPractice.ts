import type { CoachingTarget, GuidedTargetEvidence } from "./coachingTarget"
import { targetDisplayLabel } from "./coachingTarget"
import { compileCustomGramsPractice } from "./customGramsPractice"
import { compileCustomKeysPractice } from "./customKeysPractice"
import { compileDrillText } from "./drill"
import {
    PRACTICE_RECORD_VERSION,
    practiceComparisonWindow,
    type PracticeDurationSeconds,
    type PracticeFocus,
    type PracticeRecord,
    type PracticeTextStyle,
} from "./evidenceContext"
import { decodeTimeline, type EncodedTimeline, type KeystrokeEvent } from "./keystrokes"
import type { SkillCandidate, SkillReason } from "./skillEvidence"

export interface GuidedPracticeSetup {
    target: CoachingTarget
    focus: PracticeFocus
    durationSeconds: PracticeDurationSeconds
    textStyle: PracticeTextStyle
}

export interface GuidedPracticeRun {
    id: string
    completedAt: number
    practice: PracticeRecord
    timeline: EncodedTimeline
}

export interface GuidedPracticeMetric {
    label: string
    value: number
    unit: "ms" | "%" | "wpm"
    direction: "lower" | "higher"
    attempts: number
}

export interface GuidedPracticeRecap {
    targetLabel: string
    metric: GuidedPracticeMetric | null
    practiceBaseline: { value: number, attempts: number, runs: number } | null
    practiceDelta: number | null
    naturalReference: GuidedTargetEvidence | null
}

const unique = (values: readonly string[]) => [...new Set(values.map((value) => value.normalize("NFC")))]

function randomFor(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state += 0x6d2b79f5
        let value = state
        value = Math.imul(value ^ value >>> 15, value | 1)
        value ^= value + Math.imul(value ^ value >>> 7, value | 61)
        return ((value ^ value >>> 14) >>> 0) / 4294967296
    }
}

function derivedWordGrams(target: Extract<CoachingTarget, { kind: "word" }>): string[] {
    if (target.sharedGram && [...target.sharedGram].length >= 2 && [...target.sharedGram].length <= 4) return [target.sharedGram]
    const grams: string[] = []
    for (const word of target.words) {
        const characters = [...word]
        if (characters.length >= 2 && characters.length <= 4) grams.push(word)
        else for (let index = 0; index + 3 <= characters.length; index += 1) grams.push(characters.slice(index, index + 3).join(""))
    }
    return unique(grams).slice(0, 8)
}

/** One pure matrix owns the concrete editor focus for every Guided Target. */
export function guidedFocusForTarget(target: CoachingTarget): PracticeFocus | null {
    if (target.kind === "endurance") return null
    if (target.kind === "key") return { kind: "keys", items: unique(target.keys).slice(0, 8) }
    if (target.kind === "transition") return { kind: "grams", items: [target.pair] }
    if (target.kind === "gram") return { kind: "grams", items: [target.gram] }
    if (target.kind === "word") return { kind: "grams", items: derivedWordGrams(target) }
    if (target.kind === "movement") return { kind: "grams", items: unique(target.anchors).slice(0, 8) }
    return { kind: "keys", items: unique([target.expected, target.typed]).slice(0, 8) }
}

export function guidedPracticeSetup(target: CoachingTarget): GuidedPracticeSetup | null {
    const focus = guidedFocusForTarget(target)
    return focus ? { target, focus, durationSeconds: 60, textStyle: "varied" } : null
}

export function focusMatchesPrescription(focus: PracticeFocus, target: CoachingTarget): boolean {
    const prescribed = guidedFocusForTarget(target)
    return !!prescribed && focus.kind === prescribed.kind &&
        focus.items.length === prescribed.items.length &&
        focus.items.every((item, index) => item === prescribed.items[index])
}

export function guidedPracticeRecord(
    setup: GuidedPracticeSetup,
    elapsedActivityMs: number,
    completed: boolean,
): PracticeRecord {
    return {
        v: PRACTICE_RECORD_VERSION,
        kind: "guided",
        target: setup.target,
        focus: setup.focus,
        textStyle: setup.textStyle,
        durationSeconds: setup.durationSeconds,
        elapsedActivityMs: Math.max(0, Math.round(elapsedActivityMs)),
        completed,
    }
}

/** Guided mechanics stay behind one compiler regardless of the visible editor. */
export function compileGuidedPractice(input: {
    setup: GuidedPracticeSetup
    corpus: readonly string[]
    language: string
    seed: number
    wordCount?: number
}): string {
    const { setup } = input
    const wordCount = input.wordCount ?? 1_200
    if (setup.textStyle === "pseudo") {
        return setup.focus.kind === "keys"
            ? compileCustomKeysPractice({ keys: setup.focus.items, corpus: input.corpus, language: input.language, textStyle: "pseudo", seed: input.seed, wordCount })
            : compileCustomGramsPractice({ grams: setup.focus.items, corpus: input.corpus, language: input.language, textStyle: "pseudo", seed: input.seed, wordCount })
    }
    if (setup.target.kind === "key" || setup.target.kind === "correction") {
        return compileCustomKeysPractice({ keys: setup.focus.items, corpus: input.corpus, language: input.language, textStyle: "varied", seed: input.seed, wordCount })
    }
    return compileDrillText({ target: setup.target, policy: "acquisition", wordList: [...input.corpus], length: wordCount, rng: randomFor(input.seed) })
}

function median(values: readonly number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function arrivals(events: readonly KeystrokeEvent[], include: (event: KeystrokeEvent, previous: KeystrokeEvent) => boolean) {
    const samples: number[] = []
    for (let index = 1; index < events.length; index += 1) {
        if (include(events[index]!, events[index - 1]!)) samples.push(Math.max(0, events[index]!.t - events[index - 1]!.t))
    }
    return samples
}

function sequenceSamples(events: readonly KeystrokeEvent[], sequences: readonly string[]): number[] {
    const samples: number[] = []
    for (const sequence of sequences) {
        const characters = [...sequence]
        for (let start = 0; start + characters.length <= events.length; start += 1) {
            if (!characters.every((character, offset) => events[start + offset]!.key === character)) continue
            const first = events[start]!
            const last = events[start + characters.length - 1]!
            samples.push(Math.max(0, last.t - first.t) / Math.max(1, characters.length - 1))
        }
    }
    return samples
}

export function measureGuidedTarget(target: CoachingTarget, events: readonly KeystrokeEvent[]): GuidedPracticeMetric | null {
    if (target.kind === "endurance") return null
    if (target.kind === "key") {
        const keys = new Set(target.keys)
        const attempts = events.filter((event) => keys.has(event.key))
        if (attempts.length === 0) return null
        if (target.metric === "accuracy") return { label: "Target Accuracy", value: attempts.filter((event) => event.correct).length / attempts.length * 100, unit: "%", direction: "higher", attempts: attempts.length }
        const samples = arrivals(events, (event) => keys.has(event.key))
        return samples.length ? { label: "Target latency", value: median(samples), unit: "ms", direction: "lower", attempts: samples.length } : null
    }
    if (target.kind === "transition") {
        const pairs = [] as KeystrokeEvent[]
        for (let index = 1; index < events.length; index += 1) if (events[index - 1]!.key + events[index]!.key === target.pair) pairs.push(events[index]!)
        if (pairs.length === 0) return null
        if (target.metric === "accuracy") return { label: "Transition Accuracy", value: pairs.filter((event) => event.correct).length / pairs.length * 100, unit: "%", direction: "higher", attempts: pairs.length }
        const samples = arrivals(events, (event, previous) => previous.key + event.key === target.pair)
        return { label: "Transition latency", value: median(samples), unit: "ms", direction: "lower", attempts: samples.length }
    }
    if (target.kind === "correction") {
        const attempts = events.filter((event) => event.key === target.expected)
        if (attempts.length === 0) return null
        const confusions = attempts.filter((event) => !event.correct && event.typed === target.typed).length
        return { label: "Confusion rate", value: confusions / attempts.length * 100, unit: "%", direction: "lower", attempts: attempts.length }
    }
    const sequences = target.kind === "gram" ? [target.gram]
        : target.kind === "word" ? target.words
            : target.anchors
    const samples = sequenceSamples(events, sequences)
    if (samples.length === 0) return null
    return {
        label: target.kind === "word" ? "Word rhythm" : target.kind === "movement" ? "Movement latency" : "Gram latency",
        value: median(samples), unit: "ms", direction: "lower", attempts: samples.length,
    }
}

export function completeGuidedPractice(input: {
    current: GuidedPracticeRun
    history: readonly GuidedPracticeRun[]
    naturalReference?: GuidedTargetEvidence | null
}): GuidedPracticeRecap {
    const practice = input.current.practice
    if (practice.kind !== "guided") return { targetLabel: "Target", metric: null, practiceBaseline: null, practiceDelta: null, naturalReference: null }
    const metric = measureGuidedTarget(practice.target, decodeTimeline(input.current.timeline))
    const evidence = [input.current, ...input.history].map(({ id, completedAt, practice: record }) => ({ id, completedAt, practice: record }))
    const window = practiceComparisonWindow(evidence, input.current)
    const byId = new Map(input.history.map((run) => [run.id, run]))
    const priorMetrics = window.flatMap((item) => {
        const run = byId.get(item.id)
        if (!run) return []
        const measured = measureGuidedTarget(practice.target, decodeTimeline(run.timeline))
        return measured ? [measured] : []
    })
    const attempts = priorMetrics.reduce((sum, item) => sum + item.attempts, 0)
    const baselineValue = attempts > 0
        ? priorMetrics.reduce((sum, item) => sum + item.value * item.attempts, 0) / attempts
        : null
    return {
        targetLabel: targetDisplayLabel(practice.target),
        metric,
        practiceBaseline: baselineValue === null ? null : { value: baselineValue, attempts, runs: priorMetrics.length },
        practiceDelta: metric && baselineValue !== null
            ? (metric.direction === "lower" ? baselineValue - metric.value : metric.value - baselineValue)
            : null,
        naturalReference: input.naturalReference ?? null,
    }
}

export function skillReasonText(reason: SkillReason): string {
    if (reason.code === "key_latency_above_baseline") return `Recent Tests measured this key at ${Math.round(reason.observedMs)} ms, ${reason.ratio.toFixed(1)}× your usual rhythm.`
    if (reason.code === "key_accuracy_below_threshold") return `Recent Tests measured this key at ${reason.accuracyPct.toFixed(1)}% Accuracy.`
    if (reason.code === "transition_latency_above_baseline") return `Recent Tests measured this transition at ${Math.round(reason.observedMs)} ms, ${reason.ratio.toFixed(1)}× your usual rhythm.`
    if (reason.code === "transition_error_rate_high") return `Recent Tests missed this transition on ${reason.errorRatePct.toFixed(1)}% of attempts.`
    if (reason.code === "correction_confusion_recurs") return `Recent Tests found ${reason.errors} ${reason.typed}→${reason.expected} corrections.`
    if (reason.code === "gram_internal_latency_high") return `Recent Tests measured ${Math.round(reason.excessMs)} ms of extra pause inside this Gram.`
    if (reason.code === "word_internal_latency_high") return "Recent Tests measured these words below your usual internal rhythm."
    if (reason.code === "movement_latency_high") return "Recent Tests measured this movement below your usual transition rhythm."
    return `Recent ${reason.longSeconds}s Tests trailed ${reason.shortSeconds}s Tests by ${reason.gapWpm.toFixed(1)} WPM.`
}

export function guidedEvidenceFromCandidate(candidate: Pick<SkillCandidate, "metric" | "baseline" | "observed" | "sampleCount" | "reason">): GuidedTargetEvidence {
    return {
        metric: candidate.metric,
        baseline: candidate.baseline,
        observed: candidate.observed,
        sampleCount: candidate.sampleCount,
        reason: skillReasonText(candidate.reason),
    }
}

/** Corpus choices never enter this list: only directly measured Gram Targets do. */
export function measuredGramSuggestions(candidates: readonly SkillCandidate[]) {
    return candidates.flatMap((candidate) => candidate.target.kind === "gram" && candidate.reason.code === "gram_internal_latency_high" ? [{
        id: candidate.id,
        gram: candidate.target.gram,
        extraPauseMs: Math.max(0, Math.round(candidate.reason.excessMs)),
        reason: skillReasonText(candidate.reason),
        evidence: guidedEvidenceFromCandidate(candidate),
    }] : [])
}
