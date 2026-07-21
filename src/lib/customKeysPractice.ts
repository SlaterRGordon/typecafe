import {
    PRACTICE_DURATIONS_SECONDS,
    PRACTICE_RECORD_VERSION,
    PRACTICE_TEXT_STYLES,
    practiceComparisonWindow,
    type PracticeDurationSeconds,
    type PracticeRecord,
    type PracticeTextStyle,
} from "./evidenceContext"
import { decodeTimeline, type EncodedTimeline, type KeystrokeEvent } from "./keystrokes"
import { generatePhonologicalWord } from "./phonology"

export interface CustomKeysPracticePreferences {
    keys: string[]
    durationSeconds: PracticeDurationSeconds
    textStyle: PracticeTextStyle
}

export interface CustomKeysCompilationInput {
    keys: readonly string[]
    corpus: readonly string[]
    language: string
    textStyle: PracticeTextStyle
    seed: number
    wordCount?: number
}

export interface CustomKeysPracticeRun {
    id: string
    completedAt: number
    practice: PracticeRecord
    timeline: EncodedTimeline
}

export interface PracticeKeyResponse {
    key: string
    attempts: number
    accuracy: number
    speedWpm: number | null
    baseline: {
        attempts: number
        accuracy: number
        speedWpm: number | null
        runs: number
    } | null
    delta: {
        accuracyPoints: number
        speedWpm: number | null
    } | null
}

export interface CustomKeysPracticeRecap {
    keys: PracticeKeyResponse[]
    baselineReady: boolean
}

const DEFAULT_KEYS = ["e", "r"]
const DEFAULT_WORD_COUNT = 1_200
const PSEUDO_CARRIER_POOL_SIZE = 12
const normalizedCorpusCache = new WeakMap<object, string[]>()

function uniqueNfc(values: readonly string[]): string[] {
    return [...new Set(values.map((value) => value.normalize("NFC")).filter((value) => [...value].length === 1))]
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

function normalizedCorpus(corpus: readonly string[]): string[] {
    const cached = normalizedCorpusCache.get(corpus)
    if (cached) return cached
    const normalized = [...new Set(corpus.map((word) => word.trim().toLowerCase().normalize("NFC"))
        .filter((word) => word.length > 1 && [...word].every((character) => /\p{L}/u.test(character))))]
    normalizedCorpusCache.set(corpus, normalized)
    return normalized
}

function sample<T>(values: readonly T[], rng: () => number): T | null {
    return values.length === 0 ? null : values[Math.floor(rng() * values.length)] ?? null
}

function decoratedCarrier(word: string, key: string, index: number): string {
    if (/\p{L}/u.test(key)) return word
    if (/\p{N}/u.test(key)) return index % 2 === 0 ? `${word} ${key}` : `${key} ${word}`
    return index % 2 === 0 ? `${word}${key}` : `${key}${word}`
}

function insertFocus(frame: string, focus: string, rng: () => number): string {
    const points = [...frame]
    const index = points.length < 2 ? points.length : 1 + Math.floor(rng() * (points.length - 1))
    points.splice(index, 0, focus)
    return points.join("")
}

function pseudoCarrier(input: {
    focus: string
    language: string
    words: readonly string[]
    alphabet: readonly string[]
    recent: readonly string[]
    rng: () => number
}): string | null {
    const { focus, language, words, alphabet, recent, rng } = input
    const corpus = new Set(words)
    const excluded = new Set(recent)
    const letterFocus = /\p{L}/u.test(focus) && alphabet.includes(focus)

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const required = letterFocus ? focus : alphabet[Math.floor(rng() * alphabet.length)]
        if (!required) break
        const generated = generatePhonologicalWord({
            language,
            corpus: words,
            allowedCharacters: alphabet,
            requiredCharacter: required,
            rng,
        })
        if (!generated) continue
        const candidate = generated.includes(focus) ? generated : insertFocus(generated, focus, rng)
        if (!corpus.has(candidate) && !excluded.has(candidate)) return candidate
    }

    for (let attempt = 0; attempt < Math.min(32, Math.max(8, words.length)); attempt += 1) {
        const frame = sample(words, rng)
        if (!frame) return null
        const candidate = insertFocus(frame, focus, rng)
        if (!corpus.has(candidate) && !excluded.has(candidate)) return candidate
    }
    return null
}

function pseudoCarrierPool(input: {
    focus: string
    language: string
    words: readonly string[]
    alphabet: readonly string[]
    rng: () => number
}): string[] {
    const pool: string[] = []
    for (let attempt = 0; attempt < PSEUDO_CARRIER_POOL_SIZE * 4 && pool.length < PSEUDO_CARRIER_POOL_SIZE; attempt += 1) {
        const carrier = pseudoCarrier({ ...input, recent: pool })
        if (carrier && !pool.includes(carrier)) pool.push(carrier)
    }
    return pool
}

/**
 * The Custom Keys compiler treats selected keys as focus, never an alphabet.
 * Real carrier words provide supporting characters; Pseudo uses the same full
 * corpus alphabet while requiring the scheduled focus letter in each target
 * word. Every key receives a round-robin carrier before the cycle repeats.
 */
export function compileCustomKeysPractice(input: CustomKeysCompilationInput): string {
    const keys = uniqueNfc(input.keys)
    if (keys.length === 0) return ""
    const words = normalizedCorpus(input.corpus)
    if (words.length === 0) return ""
    const rng = randomFor(input.seed)
    const count = Math.max(input.wordCount ?? DEFAULT_WORD_COUNT, keys.length * 2)
    const alphabet = [...new Set(words.flatMap((word) => [...word]))]
    const carrierPools = new Map(keys.map((key) => [
        key,
        /\p{L}/u.test(key) ? words.filter((word) => word.includes(key)) : words,
    ]))
    const pseudoPools = new Map(keys.flatMap((key) => {
        const carriers = carrierPools.get(key) ?? []
        return input.textStyle === "pseudo" || carriers.length === 0
            ? [[key, pseudoCarrierPool({ focus: key, language: input.language, words, alphabet, rng })] as const]
            : []
    }))
    const recent: string[] = []
    const output: string[] = []

    for (let index = 0; index < count; index += 1) {
        const key = keys[index % keys.length]!
        const carriers = carrierPools.get(key) ?? words
        const available = carriers.filter((word) => !recent.includes(word))
        let carrier: string | null = null
        const pseudoCarriers = pseudoPools.get(key) ?? []
        if (input.textStyle === "pseudo" || carriers.length === 0) {
            const availablePseudo = pseudoCarriers.filter((word) => !recent.includes(word))
            carrier = sample(availablePseudo.length > 0 ? availablePseudo : pseudoCarriers, rng)
        }
        carrier ??= sample(available.length > 0 ? available : carriers, rng)
        carrier ??= sample(words, rng)
        if (!carrier) continue
        output.push(input.textStyle === "pseudo" || carriers.length === 0 ? carrier : decoratedCarrier(carrier, key, index))
        recent.push(carrier)
        if (recent.length > 8) recent.shift()
    }

    return output.join(" ")
}

export function customKeysPracticeRecord(
    preferences: CustomKeysPracticePreferences,
    elapsedActivityMs: number,
    completed: boolean,
): PracticeRecord {
    return {
        v: PRACTICE_RECORD_VERSION,
        kind: "custom",
        focus: { kind: "keys", items: uniqueNfc(preferences.keys) },
        textStyle: preferences.textStyle,
        durationSeconds: preferences.durationSeconds,
        elapsedActivityMs: Math.max(0, Math.round(elapsedActivityMs)),
        completed,
    }
}

function itemStats(events: readonly KeystrokeEvent[], item: string) {
    let attempts = 0
    let correct = 0
    let latencyTotalMs = 0
    let latencySamples = 0
    events.forEach((event, index) => {
        if (event.key !== item) return
        attempts += 1
        if (event.correct) correct += 1
        if (index > 0) {
            latencyTotalMs += Math.max(0, event.t - events[index - 1]!.t)
            latencySamples += 1
        }
    })
    return { attempts, correct, latencyTotalMs, latencySamples }
}

function speedWpm(totalMs: number, samples: number): number | null {
    return samples > 0 && totalMs > 0 ? 12_000 / (totalMs / samples) : null
}

/** Build focus-first recap rows and pool up to ten prior completed runs. */
export function completeCustomKeysPractice(input: {
    current: CustomKeysPracticeRun
    history: readonly CustomKeysPracticeRun[]
}): CustomKeysPracticeRecap {
    const focus = input.current.practice.focus
    if (input.current.practice.kind !== "custom" || focus.kind !== "keys") return { keys: [], baselineReady: false }
    const currentEvents = decodeTimeline(input.current.timeline)
    const evidence = [input.current, ...input.history].map(({ id, completedAt, practice }) => ({ id, completedAt, practice }))
    const rows = focus.items.flatMap((key): PracticeKeyResponse[] => {
        const current = itemStats(currentEvents, key)
        if (current.attempts === 0) return []
        const priorWindow = practiceComparisonWindow(evidence, input.current, key)
        const priorById = new Map(input.history.map((run) => [run.id, run]))
        const pooled = priorWindow.reduce((total, evidenceRun) => {
            const run = priorById.get(evidenceRun.id)
            if (!run) return total
            const stats = itemStats(decodeTimeline(run.timeline), key)
            total.attempts += stats.attempts
            total.correct += stats.correct
            total.latencyTotalMs += stats.latencyTotalMs
            total.latencySamples += stats.latencySamples
            return total
        }, { attempts: 0, correct: 0, latencyTotalMs: 0, latencySamples: 0 })
        const accuracy = current.correct / current.attempts * 100
        const currentSpeed = speedWpm(current.latencyTotalMs, current.latencySamples)
        const baseline = pooled.attempts > 0 ? {
            attempts: pooled.attempts,
            accuracy: pooled.correct / pooled.attempts * 100,
            speedWpm: speedWpm(pooled.latencyTotalMs, pooled.latencySamples),
            runs: priorWindow.length,
        } : null
        return [{
            key,
            attempts: current.attempts,
            accuracy,
            speedWpm: currentSpeed,
            baseline,
            delta: baseline ? {
                accuracyPoints: accuracy - baseline.accuracy,
                speedWpm: currentSpeed !== null && baseline.speedWpm !== null ? currentSpeed - baseline.speedWpm : null,
            } : null,
        }]
    })
    return { keys: rows, baselineReady: rows.some((row) => row.baseline !== null) }
}

export function parseCustomKeysPracticePreferences(value: unknown): CustomKeysPracticePreferences {
    const raw = value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
    const keys = Array.isArray(raw.keys) && raw.keys.every((key) => typeof key === "string")
        ? uniqueNfc(raw.keys).slice(0, 8)
        : []
    return {
        keys: keys.length > 0 ? keys : DEFAULT_KEYS,
        durationSeconds: PRACTICE_DURATIONS_SECONDS.includes(raw.durationSeconds as PracticeDurationSeconds)
            ? raw.durationSeconds as PracticeDurationSeconds
            : 60,
        textStyle: PRACTICE_TEXT_STYLES.includes(raw.textStyle as PracticeTextStyle)
            ? raw.textStyle as PracticeTextStyle
            : "varied",
    }
}
