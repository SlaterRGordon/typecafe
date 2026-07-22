import type { MovementKind } from "./movementClassification"
import { isDrillableKey, isPracticeLetter } from "./drillCharacters"

export type CoachingTarget =
    | { kind: "key", keys: string[], metric: "accuracy" | "latency" }
    | { kind: "transition", pair: string, metric: "latency" | "accuracy" }
    | { kind: "gram", gram: string }
    | { kind: "word", words: string[], sharedGram?: string }
    | { kind: "movement", movement: MovementKind, anchors: string[] }
    | { kind: "correction", expected: string, typed: string }
    | { kind: "endurance", shortSeconds: number, longSeconds: number }

type QueryValue = string | string[] | undefined
export type DrillQuery = Record<string, QueryValue>

export interface ParsedCoachingTarget {
    target: CoachingTarget
    evidence: GuidedTargetEvidence | null
    legacy: boolean
}

export interface GuidedTargetEvidence {
    metric: "ms" | "%" | "wpm"
    baseline: number
    observed: number
    sampleCount: number
    reason: string
}

export interface TargetAction {
    href: string
    label: string
    surface: "drill" | "test"
}

export interface TargetAccuracyPolicy {
    goalPct: 100
    noRush: true
}

const MOVEMENTS: readonly MovementKind[] = ["same-finger", "row-reach", "inward-roll", "outward-roll"]
const MAX_ITEMS = 8

export function parseCoachingTarget(value: unknown): CoachingTarget | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (raw.kind === "key" && Array.isArray(raw.keys) && raw.keys.length > 0 && raw.keys.length <= MAX_ITEMS &&
        raw.keys.every((key): key is string => typeof key === "string" && (isDrillableKey(key) || isPracticeLetter(key))) &&
        (raw.metric === "accuracy" || raw.metric === "latency")) {
        return { kind: "key", keys: raw.keys, metric: raw.metric }
    }
    if (raw.kind === "transition" && typeof raw.pair === "string" && [...raw.pair].length === 2 &&
        (raw.metric === "accuracy" || raw.metric === "latency")) {
        return { kind: "transition", pair: raw.pair, metric: raw.metric }
    }
    if (raw.kind === "gram" && typeof raw.gram === "string" && [...raw.gram].length >= 3 && [...raw.gram].length <= 4) {
        return { kind: "gram", gram: raw.gram }
    }
    if (raw.kind === "word" && Array.isArray(raw.words) && raw.words.length > 0 && raw.words.length <= MAX_ITEMS &&
        raw.words.every((word): word is string => typeof word === "string" && /^\p{L}+$/u.test(word)) &&
        (raw.sharedGram === undefined || (typeof raw.sharedGram === "string" && /^\p{L}+$/u.test(raw.sharedGram)))) {
        return { kind: "word", words: raw.words, ...(raw.sharedGram ? { sharedGram: raw.sharedGram } : {}) }
    }
    if (raw.kind === "movement" && MOVEMENTS.includes(raw.movement as MovementKind) && Array.isArray(raw.anchors) &&
        raw.anchors.length >= 4 && raw.anchors.length <= MAX_ITEMS &&
        raw.anchors.every((anchor): anchor is string => typeof anchor === "string" && [...anchor].length === 2)) {
        return { kind: "movement", movement: raw.movement as MovementKind, anchors: raw.anchors }
    }
    if (raw.kind === "correction" && typeof raw.expected === "string" && typeof raw.typed === "string" &&
        (isDrillableKey(raw.expected) || isPracticeLetter(raw.expected)) &&
        (isDrillableKey(raw.typed) || isPracticeLetter(raw.typed))) {
        return { kind: "correction", expected: raw.expected, typed: raw.typed }
    }
    if (raw.kind === "endurance" && Number.isInteger(raw.shortSeconds) && Number.isInteger(raw.longSeconds) &&
        (raw.shortSeconds as number) > 0 && (raw.longSeconds as number) > (raw.shortSeconds as number) &&
        (raw.longSeconds as number) <= 600) {
        return { kind: "endurance", shortSeconds: raw.shortSeconds as number, longSeconds: raw.longSeconds as number }
    }
    return null
}

export function sameCoachingTarget(a: CoachingTarget | undefined, b: CoachingTarget | undefined): boolean {
    return !!a && !!b && JSON.stringify(a) === JSON.stringify(b)
}

// Acquisition runs record which Target they were launched for in the Test
// row's otherwise-unused `options` slot (levels use it for level names; drills
// stored "" before this token existed). Analysis attributes drill volume and
// drill performance to a Target only through this token — "the drill text
// happened to contain the key" is not attribution.
const DRILL_TARGET_TOKEN_PREFIX = "target:"

export function drillTargetToken(target: CoachingTarget): string {
    return `${DRILL_TARGET_TOKEN_PREFIX}${JSON.stringify(target)}`
}

export function parseDrillTargetToken(options: string): CoachingTarget | null {
    if (!options.startsWith(DRILL_TARGET_TOKEN_PREFIX)) return null
    try {
        return parseCoachingTarget(JSON.parse(options.slice(DRILL_TARGET_TOKEN_PREFIX.length)))
    } catch {
        return null
    }
}

function first(value: QueryValue): string {
    return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function list(value: QueryValue, max = MAX_ITEMS): string[] {
    const raw = Array.isArray(value) ? value.join(",") : value ?? ""
    return [...new Set(raw.split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean))].slice(0, max)
}

function keys(value: QueryValue, max = MAX_ITEMS): string[] {
    return list(value, max).filter((item) => isDrillableKey(item) || isPracticeLetter(item))
}

function words(value: QueryValue, max = MAX_ITEMS): string[] {
    return list(value, max).filter((item) => /^\p{L}+$/u.test(item))
}

function pair(value: QueryValue): string | null {
    const characters = [...first(value).toLocaleLowerCase()].filter((character) => isDrillableKey(character) || isPracticeLetter(character))
    return characters.length >= 2 ? characters.slice(0, 2).join("") : null
}

function positiveInt(value: QueryValue, max = 600): number | null {
    const parsed = Number(first(value))
    return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : null
}

function guidedEvidence(value: QueryValue): GuidedTargetEvidence | null {
    const encoded = first(value)
    if (!encoded) return null
    try {
        const raw = JSON.parse(encoded) as Record<string, unknown>
        if ((raw.metric !== "ms" && raw.metric !== "%" && raw.metric !== "wpm") ||
            typeof raw.baseline !== "number" || !Number.isFinite(raw.baseline) ||
            typeof raw.observed !== "number" || !Number.isFinite(raw.observed) ||
            !Number.isInteger(raw.sampleCount) || (raw.sampleCount as number) < 1 ||
            typeof raw.reason !== "string" || raw.reason.trim().length === 0 || raw.reason.length > 300) return null
        return {
            metric: raw.metric,
            baseline: raw.baseline,
            observed: raw.observed,
            sampleCount: raw.sampleCount as number,
            reason: raw.reason.trim(),
        }
    } catch {
        return null
    }
}

function metricFrom(value: QueryValue, fallback: "accuracy" | "latency"): "accuracy" | "latency" {
    return first(value) === "accuracy" ? "accuracy" : first(value) === "latency" ? "latency" : fallback
}

export function parseCoachingTargetQuery(query: DrillQuery): ParsedCoachingTarget | null {
    const evidence = guidedEvidence(query.evidence)
    const explicitKind = first(query.target)
    const legacy = explicitKind.length === 0 && !query.gram && !query.movement && !query.correction

    const wordTargets = words(query.words)
    if (explicitKind === "word" || (legacy && wordTargets.length > 0)) {
        if (wordTargets.length === 0) return null
        const sharedGram = words(query.sharedGram, 1)[0]
        return {
            target: { kind: "word", words: wordTargets, ...(sharedGram ? { sharedGram } : {}) },
            evidence,
            legacy,
        }
    }

    const transition = pair(query.transitions)
    if (explicitKind === "transition" || (legacy && transition)) {
        if (!transition) return null
        return { target: { kind: "transition", pair: transition, metric: metricFrom(query.metric, "latency") }, evidence, legacy }
    }

    const keyTargets = keys(query.keys)
    if (explicitKind === "key" || (legacy && keyTargets.length > 0)) {
        if (keyTargets.length === 0) return null
        return { target: { kind: "key", keys: keyTargets, metric: metricFrom(query.metric, "accuracy") }, evidence, legacy }
    }

    if (explicitKind === "gram" || query.gram) {
        const gram = words(query.gram, 1)[0]
        if (!gram || [...gram].length < 3 || [...gram].length > 4) return null
        return { target: { kind: "gram", gram }, evidence, legacy: false }
    }

    if (explicitKind === "movement" || query.movement) {
        const movement = first(query.movement) as MovementKind
        const anchors = list(query.anchors).map((anchor) => [...anchor].slice(0, 2).join("")).filter((anchor) => [...anchor].length === 2)
        if (!MOVEMENTS.includes(movement) || anchors.length < 4) return null
        return { target: { kind: "movement", movement, anchors }, evidence, legacy: false }
    }

    if (explicitKind === "correction" || query.correction) {
        const [expected, typed] = list(query.correction, 2)
        if (!expected || !typed || !(isDrillableKey(expected) || isPracticeLetter(expected)) || !(isDrillableKey(typed) || isPracticeLetter(typed))) return null
        return { target: { kind: "correction", expected, typed }, evidence, legacy: false }
    }

    if (explicitKind === "endurance") {
        const shortSeconds = positiveInt(query.shortSeconds)
        const longSeconds = positiveInt(query.longSeconds)
        if (!shortSeconds || !longSeconds || shortSeconds >= longSeconds) return null
        return { target: { kind: "endurance", shortSeconds, longSeconds }, evidence, legacy: false }
    }

    return null
}

function encodedList(values: readonly string[]): string {
    return values.map(encodeURIComponent).join(",")
}

export function targetAccuracyPolicy(target: CoachingTarget): TargetAccuracyPolicy | null {
    if (target.kind === "correction" || (target.kind === "transition" && target.metric === "accuracy")) {
        return { goalPct: 100, noRush: true }
    }
    return null
}

export function targetDisplayLabel(target: CoachingTarget): string {
    if (target.kind === "key") return target.keys.join(" ")
    if (target.kind === "transition") return `${target.pair[0]}→${target.pair[1]}`
    if (target.kind === "gram") return target.gram
    if (target.kind === "word") return target.sharedGram ?? target.words.join(", ")
    if (target.kind === "movement") return "this movement"
    if (target.kind === "correction") return `these ${target.expected}/${target.typed} keys`
    return `${target.shortSeconds}s → ${target.longSeconds}s`
}

export function targetVisualKeys(target: CoachingTarget): string[] {
    if (target.kind === "key") return target.keys.slice(0, 4)
    if (target.kind === "transition") return [...target.pair].slice(0, 2)
    if (target.kind === "gram") return [...target.gram].slice(0, 4)
    if (target.kind === "word") return [...(target.sharedGram ?? target.words[0] ?? "")].slice(0, 4)
    if (target.kind === "movement") return [...(target.anchors[0] ?? "")].slice(0, 2)
    if (target.kind === "correction") return [target.typed, target.expected]
    return []
}

export function targetUsesArrow(target: CoachingTarget): boolean {
    return target.kind === "transition" || target.kind === "movement" || target.kind === "correction"
}

export function targetAction(
    target: CoachingTarget,
    options: { length?: number, evidence?: GuidedTargetEvidence } = {},
): TargetAction {
    const suffix = [
        ...(options.length ? [`length=${Math.max(1, Math.min(120, Math.floor(options.length)))}`] : []),
        ...(options.evidence ? [`evidence=${encodeURIComponent(JSON.stringify(options.evidence))}`] : []),
    ].join("&")
    const workspace = "/practice"
    if (target.kind === "endurance") {
        return {
            href: `/?mode=timed&count=${target.longSeconds}&target=endurance&shortSeconds=${target.shortSeconds}&longSeconds=${target.longSeconds}`,
            label: "Check endurance",
            surface: "test",
        }
    }
    if (target.kind === "key") {
        return { href: `${workspace}?target=key&keys=${encodedList(target.keys)}&metric=${target.metric}&${suffix}`, label: "Practice these keys", surface: "drill" }
    }
    if (target.kind === "transition") {
        return { href: `${workspace}?target=transition&transitions=${encodeURIComponent(target.pair)}&metric=${target.metric}&${suffix}`, label: "Practice this transition", surface: "drill" }
    }
    if (target.kind === "gram") {
        return { href: `${workspace}?target=gram&gram=${encodeURIComponent(target.gram)}&${suffix}`, label: "Practice this pattern", surface: "drill" }
    }
    if (target.kind === "word") {
        const shared = target.sharedGram ? `&sharedGram=${encodeURIComponent(target.sharedGram)}` : ""
        return { href: `${workspace}?target=word&words=${encodedList(target.words)}${shared}&${suffix}`, label: "Practice these words", surface: "drill" }
    }
    if (target.kind === "movement") {
        return { href: `${workspace}?target=movement&movement=${target.movement}&anchors=${encodedList(target.anchors)}&${suffix}`, label: "Practice this movement", surface: "drill" }
    }
    return {
        href: `${workspace}?target=correction&correction=${encodedList([target.expected, target.typed])}&${suffix}`,
        label: "Practice these keys",
        surface: "drill",
    }
}
