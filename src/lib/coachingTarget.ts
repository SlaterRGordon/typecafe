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

export type DrillPolicy = "acquisition" | "transfer" | "cold"

type QueryValue = string | string[] | undefined
export type DrillQuery = Record<string, QueryValue>

export interface ParsedCoachingTarget {
    target: CoachingTarget
    policy: DrillPolicy
    seenWords: string[]
    legacy: boolean
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

function policyFrom(value: QueryValue): DrillPolicy {
    const policy = first(value)
    return policy === "transfer" || policy === "cold" ? policy : "acquisition"
}

function metricFrom(value: QueryValue, fallback: "accuracy" | "latency"): "accuracy" | "latency" {
    return first(value) === "accuracy" ? "accuracy" : first(value) === "latency" ? "latency" : fallback
}

export function parseCoachingTargetQuery(query: DrillQuery): ParsedCoachingTarget | null {
    const policy = policyFrom(query.policy)
    const seenWords = words(query.seen, 40)
    const explicitKind = first(query.target)
    const legacy = explicitKind.length === 0 && !query.gram && !query.movement && !query.correction

    const wordTargets = words(query.words)
    if (explicitKind === "word" || (legacy && wordTargets.length > 0)) {
        if (wordTargets.length === 0) return null
        const sharedGram = words(query.sharedGram, 1)[0]
        return {
            target: { kind: "word", words: wordTargets, ...(sharedGram ? { sharedGram } : {}) },
            policy,
            seenWords,
            legacy,
        }
    }

    const transition = pair(query.transitions)
    if (explicitKind === "transition" || (legacy && transition)) {
        if (!transition) return null
        return { target: { kind: "transition", pair: transition, metric: metricFrom(query.metric, "latency") }, policy, seenWords, legacy }
    }

    const keyTargets = keys(query.keys)
    if (explicitKind === "key" || (legacy && keyTargets.length > 0)) {
        if (keyTargets.length === 0) return null
        return { target: { kind: "key", keys: keyTargets, metric: metricFrom(query.metric, "accuracy") }, policy, seenWords, legacy }
    }

    if (explicitKind === "gram" || query.gram) {
        const gram = words(query.gram, 1)[0]
        if (!gram || [...gram].length < 3 || [...gram].length > 4) return null
        return { target: { kind: "gram", gram }, policy, seenWords, legacy: false }
    }

    if (explicitKind === "movement" || query.movement) {
        const movement = first(query.movement) as MovementKind
        const anchors = list(query.anchors).map((anchor) => [...anchor].slice(0, 2).join("")).filter((anchor) => [...anchor].length === 2)
        if (!MOVEMENTS.includes(movement) || anchors.length < 4) return null
        return { target: { kind: "movement", movement, anchors }, policy, seenWords, legacy: false }
    }

    if (explicitKind === "correction" || query.correction) {
        const [expected, typed] = list(query.correction, 2)
        if (!expected || !typed || !(isDrillableKey(expected) || isPracticeLetter(expected)) || !(isDrillableKey(typed) || isPracticeLetter(typed))) return null
        return { target: { kind: "correction", expected, typed }, policy, seenWords, legacy: false }
    }

    if (explicitKind === "endurance") {
        const shortSeconds = positiveInt(query.shortSeconds)
        const longSeconds = positiveInt(query.longSeconds)
        if (!shortSeconds || !longSeconds || shortSeconds >= longSeconds) return null
        return { target: { kind: "endurance", shortSeconds, longSeconds }, policy, seenWords, legacy: false }
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

export function targetAction(
    target: CoachingTarget,
    policy: DrillPolicy = "acquisition",
    options: { seenWords?: readonly string[], length?: number } = {},
): TargetAction {
    const suffix = [
        `policy=${policy}`,
        ...(options.length ? [`length=${Math.max(1, Math.min(120, Math.floor(options.length)))}`] : []),
        ...(options.seenWords?.length ? [`seen=${encodedList(options.seenWords)}`] : []),
    ].join("&")
    if (target.kind === "endurance") {
        return {
            href: `/?mode=timed&count=${target.longSeconds}&coaching=endurance&target=endurance&shortSeconds=${target.shortSeconds}&longSeconds=${target.longSeconds}&policy=${policy}`,
            label: "Check endurance",
            surface: "test",
        }
    }
    if (target.kind === "key") {
        return { href: `/drill?target=key&keys=${encodedList(target.keys)}&metric=${target.metric}&${suffix}`, label: "Practice these keys", surface: "drill" }
    }
    if (target.kind === "transition") {
        return { href: `/drill?target=transition&transitions=${encodeURIComponent(target.pair)}&metric=${target.metric}&${suffix}`, label: "Practice this transition", surface: "drill" }
    }
    if (target.kind === "gram") {
        return { href: `/drill?target=gram&gram=${encodeURIComponent(target.gram)}&${suffix}`, label: "Practice this pattern", surface: "drill" }
    }
    if (target.kind === "word") {
        const shared = target.sharedGram ? `&sharedGram=${encodeURIComponent(target.sharedGram)}` : ""
        return { href: `/drill?target=word&words=${encodedList(target.words)}${shared}&${suffix}`, label: "Practice these words", surface: "drill" }
    }
    if (target.kind === "movement") {
        return { href: `/drill?target=movement&movement=${target.movement}&anchors=${encodedList(target.anchors)}&${suffix}`, label: "Practice this movement", surface: "drill" }
    }
    return {
        href: `/drill?target=correction&correction=${encodedList([target.expected, target.typed])}&${suffix}`,
        label: "Practice these keys",
        surface: "drill",
    }
}
