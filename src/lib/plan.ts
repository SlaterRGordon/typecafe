// Practice plans (Phase 4 §4.4) — the flagship "your 30-day plan". Pure and
// unit-testable. A plan is just an ordered list of days, each a short sequence
// of drills built from the user's *own* weakness data. Plans reuse existing
// modes (they never invent test types): every step is a deep-link into a
// configured test.

import type { KeyAccuracy } from "./stats"
import type { SlowTransition } from "./transitions"

export const PLAN_LENGTH_DAYS = 30
export const CALIBRATION_DAYS = 7
// Below this much history we can't target weaknesses honestly — run a
// calibration week of varied tests to build the profile first.
export const MIN_HISTORY_DAYS = 7
const KEYS_PER_DRILL = 3
const BENCHMARK_EVERY = 7

export type DrillKind = "warmup" | "keys" | "transition" | "benchmark" | "calibration"

export interface DrillStep {
    kind: DrillKind
    label: string
    // Deep-link into an existing surface: warm-up/benchmark/calibration steps hit
    // the home page (/?mode=…); targeted key/transition drills hit /drill.
    href: string
}

export interface PlanDay {
    day: number // 1-based
    steps: DrillStep[]
    isBenchmark: boolean
}

export interface Plan {
    kind: "calibration" | "targeted"
    days: PlanDay[]
}

export interface PlanInput {
    // Lifetime worst keys / transitions, worst first (may be empty).
    worstKeys: KeyAccuracy[]
    worstTransitions: SlowTransition[]
    // The user's main timed/words config — used for warm-ups and benchmarks.
    benchmark: { subMode: "timed" | "words"; count: number }
    // Days of history available; below MIN_HISTORY_DAYS → calibration plan.
    historyDays: number
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

function configHref(subMode: "timed" | "words", count: number): string {
    return `/?mode=${subMode}&count=${count}`
}

function warmupStep(): DrillStep {
    // A 15s timed warm-up runs on /drill (same surface as the drills) so the whole
    // session flows through one place with seamless step-to-step advancing.
    return { kind: "warmup", label: "Warm-up — 15s timed", href: "/drill?seconds=15" }
}

function benchmarkStep(benchmark: { subMode: "timed" | "words"; count: number }): DrillStep {
    const unit = benchmark.subMode === "timed" ? "s timed" : " words"
    return { kind: "benchmark", label: `Benchmark — ${benchmark.count}${unit}`, href: configHref(benchmark.subMode, benchmark.count) }
}

function keysStep(keys: string[]): DrillStep {
    return { kind: "keys", label: `Drill your weakest keys: ${keys.join(", ")}`, href: `/drill?keys=${keys.join(",")}` }
}

function transitionStep(t: SlowTransition): DrillStep {
    return { kind: "transition", label: `Drill the ${t.from}→${t.to} transition`, href: `/drill?transitions=${t.from}${t.to}` }
}

// A 7-day calibration plan: varied tests across modes/lengths to build a profile
// when there isn't enough history to target weaknesses.
function calibrationPlan(benchmark: { subMode: "timed" | "words"; count: number }): Plan {
    const varied: DrillStep[] = [
        { kind: "calibration", label: "Calibration — 30s timed", href: configHref("timed", 30) },
        { kind: "calibration", label: "Calibration — 25 words", href: configHref("words", 25) },
        { kind: "calibration", label: "Calibration — 60s timed", href: configHref("timed", 60) },
        { kind: "calibration", label: "Calibration — grams", href: "/?mode=grams" },
        { kind: "calibration", label: "Calibration — 50 words", href: configHref("words", 50) },
        { kind: "calibration", label: "Calibration — 15s timed", href: configHref("timed", 15) },
    ]
    const days: PlanDay[] = Array.from({ length: CALIBRATION_DAYS }, (_, i) => {
        const day = i + 1
        const isBenchmark = day === CALIBRATION_DAYS
        return {
            day,
            isBenchmark,
            steps: isBenchmark ? [warmupStep(), benchmarkStep(benchmark)] : [warmupStep(), varied[i % varied.length]!],
        }
    })
    return { kind: "calibration", days }
}

// Build the user's 30-day plan from their weakness data, or a calibration week
// when there's too little history (or no weaknesses surfaced yet).
export function generatePlan(input: PlanInput): Plan {
    const hasWeaknessData = input.worstKeys.length > 0 || input.worstTransitions.length > 0
    if (input.historyDays < MIN_HISTORY_DAYS || !hasWeaknessData) {
        return calibrationPlan(input.benchmark)
    }

    const keyChunks = chunk(input.worstKeys.map((k) => k.key), KEYS_PER_DRILL)
    const transitions = input.worstTransitions

    const days: PlanDay[] = Array.from({ length: PLAN_LENGTH_DAYS }, (_, i) => {
        const day = i + 1
        const isBenchmark = day % BENCHMARK_EVERY === 0
        const steps: DrillStep[] = [warmupStep()]

        // Two targeted drills, rotating through the weakness lists so different
        // days hit different keys/transitions.
        if (keyChunks.length > 0) steps.push(keysStep(keyChunks[i % keyChunks.length]!))
        if (transitions.length > 0) steps.push(transitionStep(transitions[i % transitions.length]!))
        // If only one source exists, add a second drill from it so every day has
        // a full session.
        if (steps.length < 3) {
            if (keyChunks.length > 0) steps.push(keysStep(keyChunks[(i + 1) % keyChunks.length]!))
            else if (transitions.length > 0) steps.push(transitionStep(transitions[(i + 1) % transitions.length]!))
        }

        if (isBenchmark) steps.push(benchmarkStep(input.benchmark))
        return { day, steps, isBenchmark }
    })

    return { kind: "targeted", days }
}
