import type { EncodedKeystroke } from "./keystrokes"

export type ImpossibleTimelineReason =
    | "too_many_zero_gaps"
    | "sustained_machine_burst"
    | "machine_average_latency"
    | "variance_floor"

export interface ImpossibleTimelineResult {
    impossible: boolean
    reason: ImpossibleTimelineReason | null
    measuredGaps: number
    zeroGapCount: number
    minGapMs: number | null
    meanGapMs: number | null
    p05GapMs: number | null
    p95GapMs: number | null
}

const MIN_MEASURED_GAPS = 12
const ZERO_GAP_MIN_COUNT = 8
const ZERO_GAP_MIN_RATIO = 0.35
const BURST_GAP_MS = 4
const BURST_LENGTH = 10
const MACHINE_MEAN_GAP_MS = 12
const MACHINE_MEAN_MIN_GAPS = 24
const VARIANCE_MIN_GAPS = 30
const VARIANCE_MEAN_MAX_MS = 28
const VARIANCE_SPREAD_MAX_MS = 2

function percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
    return sorted[index]!
}

function maxConsecutiveAtOrBelow(values: number[], threshold: number): number {
    let best = 0
    let run = 0
    for (const value of values) {
        if (value <= threshold) {
            run += 1
            best = Math.max(best, run)
        } else {
            run = 0
        }
    }
    return best
}

export function detectImpossibleTimeline(timeline: EncodedKeystroke[]): ImpossibleTimelineResult {
    const gaps = timeline
        .slice(1)
        .map(([, , dtMs]) => Math.max(0, dtMs))
    const sorted = [...gaps].sort((a, b) => a - b)
    const measuredGaps = gaps.length
    const zeroGapCount = gaps.filter((gap) => gap === 0).length
    const minGapMs = sorted[0] ?? null
    const meanGapMs = measuredGaps === 0 ? null : gaps.reduce((sum, gap) => sum + gap, 0) / measuredGaps
    const p05GapMs = percentile(sorted, 0.05)
    const p95GapMs = percentile(sorted, 0.95)
    const base = {
        measuredGaps,
        zeroGapCount,
        minGapMs,
        meanGapMs,
        p05GapMs,
        p95GapMs,
    }

    if (measuredGaps < MIN_MEASURED_GAPS || meanGapMs === null) {
        return { ...base, impossible: false, reason: null }
    }

    if (zeroGapCount >= ZERO_GAP_MIN_COUNT && zeroGapCount / measuredGaps >= ZERO_GAP_MIN_RATIO) {
        return { ...base, impossible: true, reason: "too_many_zero_gaps" }
    }

    if (maxConsecutiveAtOrBelow(gaps, BURST_GAP_MS) >= BURST_LENGTH) {
        return { ...base, impossible: true, reason: "sustained_machine_burst" }
    }

    if (measuredGaps >= MACHINE_MEAN_MIN_GAPS && meanGapMs <= MACHINE_MEAN_GAP_MS) {
        return { ...base, impossible: true, reason: "machine_average_latency" }
    }

    if (
        measuredGaps >= VARIANCE_MIN_GAPS &&
        meanGapMs <= VARIANCE_MEAN_MAX_MS &&
        p05GapMs !== null &&
        p95GapMs !== null &&
        p95GapMs - p05GapMs <= VARIANCE_SPREAD_MAX_MS
    ) {
        return { ...base, impossible: true, reason: "variance_floor" }
    }

    return { ...base, impossible: false, reason: null }
}

export function isRankableTimeline(timeline: EncodedKeystroke[]): boolean {
    return !detectImpossibleTimeline(timeline).impossible
}
