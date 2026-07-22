import {
    PRACTICE_RECORD_VERSION,
    PRACTICE_TEXT_STYLES,
    practiceComparisonWindow,
    type PracticeDurationSeconds,
    type PracticeRecord,
    type PracticeTextStyle,
} from "./evidenceContext"
import { decodeTimeline, type EncodedTimeline, type KeystrokeEvent } from "./keystrokes"
import {
    generatePhonologicalFocusCarrier,
    generatePhonologicalSequenceWord,
    type PhonologicalSequencePosition,
} from "./phonology"
import { normalizePracticeGram, normalizePracticeItem, practiceItemKind } from "./practiceItem"
import { isFiniteTimedSeconds } from "./testConfig"

export interface CustomGramsPracticePreferences {
    grams: string[]
    durationSeconds: PracticeDurationSeconds
    textStyle: PracticeTextStyle
}

export interface CustomGramsCompilationInput {
    grams: readonly string[]
    corpus: readonly string[]
    language: string
    textStyle: PracticeTextStyle
    seed: number
    wordCount?: number
}

export interface CommonGram {
    gram: string
    length: 2 | 3 | 4
    frequency: number
}

export interface CustomGramsPracticeRun {
    id: string
    completedAt: number
    practice: PracticeRecord
    timeline: EncodedTimeline
}

export interface PracticeGramResponse {
    gram: string
    attempts: number
    accuracy: number
    latencyMs: number | null
    speedWpm: number | null
    baseline: {
        attempts: number
        accuracy: number
        latencyMs: number | null
        speedWpm: number | null
        runs: number
    } | null
    delta: {
        accuracyPoints: number
        latencyMs: number | null
        speedWpm: number | null
    } | null
}

export interface CustomGramsPracticeRecap {
    grams: PracticeGramResponse[]
    baselineReady: boolean
}

const DEFAULT_GRAMS = ["th", "the", "tion"]
const DEFAULT_WORD_COUNT = 1_200
const RECENT_CARRIERS = 8
const PSEUDO_CARRIER_POOL_SIZE = 12
const PSEUDO_POSITIONS = ["initial", "medial", "final"] as const satisfies readonly PhonologicalSequencePosition[]
const normalizedCorpusCache = new WeakMap<object, string[]>()

const characters = (value: string): string[] => [...value]

/** Backward-compatible name for measured/common Gram-only callers. */
export const normalizeCustomGram = normalizePracticeGram

function uniquePracticeItems(values: readonly string[]): string[] {
    const normalized = values.map(normalizePracticeItem).filter((value): value is string => value !== null)
    return [...new Set(normalized)]
}

function normalizedCorpus(corpus: readonly string[]): string[] {
    const cached = normalizedCorpusCache.get(corpus)
    if (cached) return cached
    const normalized = [...new Set(corpus.map((word) => word.trim().toLowerCase().normalize("NFC"))
        .filter((word) => characters(word).length > 1 && characters(word).every((character) => /\p{L}/u.test(character))))]
    normalizedCorpusCache.set(corpus, normalized)
    return normalized
}

function occurrences(value: string, target: string): number {
    const source = characters(value)
    const needle = characters(target)
    let count = 0
    for (let index = 0; index + needle.length <= source.length; index += 1) {
        if (needle.every((character, offset) => source[index + offset] === character)) count += 1
    }
    return count
}

/**
 * Rank active-language corpus material without consulting measured evidence.
 * Every length is ranked independently, then ranks are interleaved into one
 * mixed tray so a shorter Gram cannot crowd out all longer choices.
 */
export function rankCommonGrams(corpus: readonly string[], perLength = 6): CommonGram[] {
    const words = normalizedCorpus(corpus)
    const ranked = ([2, 3, 4] as const).map((length) => {
        const frequency = new Map<string, number>()
        for (const word of words) {
            const points = characters(word)
            for (let index = 0; index + length <= points.length; index += 1) {
                const gram = points.slice(index, index + length).join("")
                frequency.set(gram, (frequency.get(gram) ?? 0) + 1)
            }
        }
        return [...frequency.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(0, perLength))
            .map(([gram, count]) => ({ gram, length, frequency: count }))
    })
    const mixed: CommonGram[] = []
    for (let rank = 0; rank < Math.max(0, perLength); rank += 1) {
        ranked.forEach((items) => { if (items[rank]) mixed.push(items[rank]!) })
    }
    return mixed
}

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

function sample<T>(values: readonly T[], rng: () => number): T | null {
    return values.length === 0 ? null : values[Math.floor(rng() * values.length)] ?? null
}

function isUsefulCarrier(word: string, gram: string): boolean {
    return occurrences(word, gram) > 0 && characters(word).length > characters(gram).length
}

function sequenceStart(value: readonly string[], target: readonly string[]): number {
    for (let index = 0; index + target.length <= value.length; index += 1) {
        if (target.every((character, offset) => value[index + offset] === character)) return index
    }
    return -1
}

function hasSequencePosition(word: string, target: readonly string[], position: PhonologicalSequencePosition): boolean {
    const points = characters(word)
    const start = sequenceStart(points, target)
    if (start < 0) return false
    if (position === "initial") return start === 0 && target.length < points.length
    if (position === "medial") return start > 0 && start + target.length < points.length
    if (position === "final") return start > 0 && start + target.length === points.length
    return target.length < points.length
}

interface PseudoCarrierInput {
    gram: string
    targetPoints: readonly string[]
    words: readonly string[]
    corpusWords: ReadonlySet<string>
    alphabet: readonly string[]
    language: string
    position: PhonologicalSequencePosition
    excluded: ReadonlySet<string>
    rng: () => number
}

function pseudoCarrier(input: PseudoCarrierInput): string | null {
    const { gram, targetPoints, words, corpusWords, alphabet, language, position, excluded, rng } = input
    const allowedCharacters = [...new Set([...alphabet, ...targetPoints])]

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const generated = generatePhonologicalSequenceWord({
            language,
            corpus: words,
            allowedCharacters,
            requiredSequence: gram,
            excluded,
            position,
            rng,
        })
        if (generated && hasSequencePosition(generated, targetPoints, position) && !corpusWords.has(generated) && !excluded.has(generated)) return generated
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
        const candidate = generatePhonologicalFocusCarrier({ language, focus: gram, position, rng })
        if (candidate && hasSequencePosition(candidate, targetPoints, position) && !corpusWords.has(candidate) && !excluded.has(candidate)) return candidate
    }
    return null
}

function pseudoCarrierPool(input: Omit<PseudoCarrierInput, "excluded">): string[] {
    const pool: string[] = []
    const targetSize = PSEUDO_CARRIER_POOL_SIZE / PSEUDO_POSITIONS.length
    for (let attempt = 0; attempt < targetSize * 8 && pool.length < targetSize; attempt += 1) {
        const carrier = pseudoCarrier({ ...input, excluded: new Set(pool) })
        if (carrier && !pool.includes(carrier)) pool.push(carrier)
    }
    return pool
}

/**
 * Compile one finite mixed-Gram prompt. Selected Grams receive equal scheduled
 * carrier slots. Incidental overlapping occurrences are retained rather than
 * stripped, and every search is bounded for reliable sparse-corpus behavior.
 */
export function compileCustomGramsPractice(input: CustomGramsCompilationInput): string {
    const grams = uniquePracticeItems(input.grams)
    const words = normalizedCorpus(input.corpus)
    if (grams.length === 0 || words.length === 0) return ""
    const rng = randomFor(input.seed)
    const count = Math.max(input.wordCount ?? DEFAULT_WORD_COUNT, grams.length * 2)
    const alphabet = [...new Set(words.flatMap(characters))]
    const corpusWords = new Set(words)
    const carrierPools = new Map(grams.map((gram) => [gram, {
        targetPoints: characters(gram),
        realCarriers: practiceItemKind(gram) === "word" ? [gram] : words.filter((word) => isUsefulCarrier(word, gram)),
    }]))
    const pseudoPools = new Map(grams.flatMap((gram) => {
        const pool = carrierPools.get(gram)!
        return practiceItemKind(gram) === "gram" && (input.textStyle === "pseudo" || pool.realCarriers.length === 0)
            ? [[gram, new Map(PSEUDO_POSITIONS.map((position) => [position, pseudoCarrierPool({
                gram, targetPoints: pool.targetPoints, words, corpusWords, alphabet, language: input.language, position, rng,
            })]))] as const]
            : []
    }))
    const recent: string[] = []
    const output: string[] = []

    for (let index = 0; index < count; index += 1) {
        const gram = grams[index % grams.length]!
        const pool = carrierPools.get(gram)!
        if (practiceItemKind(gram) === "word") {
            output.push(gram)
            recent.push(gram)
            if (recent.length > RECENT_CARRIERS) recent.shift()
            continue
        }
        const excluded = new Set(recent)
        const realCarriers = pool.realCarriers
        const available = realCarriers.filter((word) => !excluded.has(word))
        const usePseudo = input.textStyle === "pseudo" || realCarriers.length === 0
        const position = PSEUDO_POSITIONS[Math.floor(index / grams.length) % PSEUDO_POSITIONS.length]!
        const poolsByPosition = pseudoPools.get(gram)
        const pseudoCarriers = poolsByPosition?.get(position) ?? []
        const availablePseudo = pseudoCarriers.filter((word) => !excluded.has(word))
        const nonRepeatingPseudo = pseudoCarriers.filter((word) => word !== recent.at(-1))
        const pseudoCandidates = availablePseudo.length > 0 ? availablePseudo : nonRepeatingPseudo.length > 0 ? nonRepeatingPseudo : pseudoCarriers
        const carrier = usePseudo
            ? sample(pseudoCandidates, rng)
            : sample(available.length > 0 ? available : realCarriers, rng)
                ?? sample(availablePseudo.length > 0 ? availablePseudo : pseudoCarriers, rng)
        if (!carrier) continue
        output.push(carrier)
        recent.push(carrier)
        if (recent.length > RECENT_CARRIERS) recent.shift()
    }

    return output.join(" ")
}

export function customGramsPracticeRecord(
    preferences: CustomGramsPracticePreferences,
    elapsedActivityMs: number,
    completed: boolean,
): PracticeRecord {
    return {
        v: PRACTICE_RECORD_VERSION,
        kind: "custom",
        focus: { kind: "grams", items: uniquePracticeItems(preferences.grams) },
        textStyle: preferences.textStyle,
        durationSeconds: preferences.durationSeconds,
        elapsedActivityMs: Math.max(0, Math.round(elapsedActivityMs)),
        completed,
    }
}

interface GramStats {
    attempts: number
    correct: number
    latencyTotalMs: number
    latencySamples: number
}

function gramStats(events: readonly KeystrokeEvent[], gram: string): GramStats {
    const target = characters(gram)
    const stats: GramStats = { attempts: 0, correct: 0, latencyTotalMs: 0, latencySamples: 0 }
    for (let index = 0; index + target.length <= events.length; index += 1) {
        const window = events.slice(index, index + target.length)
        if (!target.every((character, offset) => window[offset]?.key.normalize("NFC") === character)) continue
        stats.attempts += 1
        if (window.every((event) => event.correct)) stats.correct += 1
        for (let offset = 1; offset < window.length; offset += 1) {
            stats.latencyTotalMs += Math.max(0, window[offset]!.t - window[offset - 1]!.t)
            stats.latencySamples += 1
        }
    }
    return stats
}

function latencyMs(totalMs: number, samples: number): number | null {
    return samples > 0 ? totalMs / samples : null
}

function speedWpm(totalMs: number, samples: number): number | null {
    const latency = latencyMs(totalMs, samples)
    return latency !== null && latency > 0 ? 12_000 / latency : null
}

/** Build per-Gram response rows from this run and up to ten prior cohort runs. */
export function completeCustomGramsPractice(input: {
    current: CustomGramsPracticeRun
    history: readonly CustomGramsPracticeRun[]
}): CustomGramsPracticeRecap {
    const focus = input.current.practice.focus
    if (input.current.practice.kind !== "custom" || focus.kind !== "grams") return { grams: [], baselineReady: false }
    const currentEvents = decodeTimeline(input.current.timeline)
    const evidence = [input.current, ...input.history].map(({ id, completedAt, practice }) => ({ id, completedAt, practice }))
    const rows = focus.items.flatMap((gram): PracticeGramResponse[] => {
        const current = gramStats(currentEvents, gram)
        if (current.attempts === 0) return []
        const priorWindow = practiceComparisonWindow(evidence, input.current, gram)
        const priorById = new Map(input.history.map((run) => [run.id, run]))
        const pooled = priorWindow.reduce<GramStats>((total, evidenceRun) => {
            const run = priorById.get(evidenceRun.id)
            if (!run) return total
            const stats = gramStats(decodeTimeline(run.timeline), gram)
            total.attempts += stats.attempts
            total.correct += stats.correct
            total.latencyTotalMs += stats.latencyTotalMs
            total.latencySamples += stats.latencySamples
            return total
        }, { attempts: 0, correct: 0, latencyTotalMs: 0, latencySamples: 0 })
        const accuracy = current.correct / current.attempts * 100
        const currentLatency = latencyMs(current.latencyTotalMs, current.latencySamples)
        const currentSpeed = speedWpm(current.latencyTotalMs, current.latencySamples)
        const baseline = pooled.attempts > 0 ? {
            attempts: pooled.attempts,
            accuracy: pooled.correct / pooled.attempts * 100,
            latencyMs: latencyMs(pooled.latencyTotalMs, pooled.latencySamples),
            speedWpm: speedWpm(pooled.latencyTotalMs, pooled.latencySamples),
            runs: priorWindow.length,
        } : null
        return [{
            gram,
            attempts: current.attempts,
            accuracy,
            latencyMs: currentLatency,
            speedWpm: currentSpeed,
            baseline,
            delta: baseline ? {
                accuracyPoints: accuracy - baseline.accuracy,
                latencyMs: currentLatency !== null && baseline.latencyMs !== null ? baseline.latencyMs - currentLatency : null,
                speedWpm: currentSpeed !== null && baseline.speedWpm !== null ? currentSpeed - baseline.speedWpm : null,
            } : null,
        }]
    })
    return { grams: rows, baselineReady: rows.some((row) => row.baseline !== null) }
}

export function parseCustomGramsPracticePreferences(value: unknown): CustomGramsPracticePreferences {
    const raw = value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
    const grams = Array.isArray(raw.grams) && raw.grams.every((gram) => typeof gram === "string")
        ? uniquePracticeItems(raw.grams).slice(0, 24)
        : []
    return {
        grams: grams.length > 0 ? grams : DEFAULT_GRAMS,
        durationSeconds: isFiniteTimedSeconds(raw.durationSeconds)
            ? raw.durationSeconds
            : 60,
        textStyle: PRACTICE_TEXT_STYLES.includes(raw.textStyle as PracticeTextStyle)
            ? raw.textStyle as PracticeTextStyle
            : "varied",
    }
}
