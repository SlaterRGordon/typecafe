// Net-WPM aggregation for callers that intentionally select raw Test fields.
// Test.score now persists canonical net WPM, but several historical
// ranking/averaging paths still operate on speed + accuracy. Concentrating that
// compatibility derivation here keeps their reductions unit-testable over plain
// row arrays without a Prisma mock.

import { netFromRaw } from "./stats"

// The raw compatibility fields net WPM can be derived from.
export interface NetRow {
    speed: number
    accuracy: number
}

// Net WPM for a raw row that did not select the persisted canonical score.
export function netOf(row: NetRow): number {
    return netFromRaw(row.speed, row.accuracy)
}

// Mean net WPM over a set of rows, or null below `minSamples` - the one place the
// "don't compare on too little history" floor lives (callers used to repeat the
// length check next to a hand-rolled reduce).
export function averageNet(rows: NetRow[], minSamples = 1): number | null {
    if (rows.length < minSamples) return null
    return rows.reduce((sum, row) => sum + netOf(row), 0) / rows.length
}

// One row per user - their single best run by net WPM. Keeps the full row (not
// just the number) so each caller does its own DTO shaping (username, image, rank).
export function bestNetPerUser<T extends NetRow & { userId: string }>(rows: T[]): T[] {
    const best = new Map<string, T>()
    for (const row of rows) {
        const current = best.get(row.userId)
        if (!current || netOf(row) > netOf(current)) best.set(row.userId, row)
    }
    return Array.from(best.values())
}
