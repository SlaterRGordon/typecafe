// Net-WPM aggregation over stored Test rows. Net WPM — the canonical headline
// metric — isn't persisted; it's derived on read via netFromRaw (see stats.ts).
// Every ranking/averaging surface used to re-derive it inline in the test router;
// concentrating those reductions here makes them unit-testable over plain row
// arrays, without a Prisma mock.

import { netFromRaw } from "./stats"

// The raw fields net WPM is derived from. Any Test row select that includes
// speed + accuracy satisfies it.
export interface NetRow {
    speed: number
    accuracy: number
}

// Net WPM for a single row — derived on read from the persisted raw speed + accuracy.
export function netOf(row: NetRow): number {
    return netFromRaw(row.speed, row.accuracy)
}

// Mean net WPM over a set of rows, or null below `minSamples` — the one place the
// "don't compare on too little history" floor lives (callers used to repeat the
// length check next to a hand-rolled reduce).
export function averageNet(rows: NetRow[], minSamples = 1): number | null {
    if (rows.length < minSamples) return null
    return rows.reduce((sum, row) => sum + netOf(row), 0) / rows.length
}

// One row per user — their single best run by net WPM. Keeps the full row (not
// just the number) so each caller does its own DTO shaping (username, image, rank).
export function bestNetPerUser<T extends NetRow & { userId: string }>(rows: T[]): T[] {
    const best = new Map<string, T>()
    for (const row of rows) {
        const current = best.get(row.userId)
        if (!current || netOf(row) > netOf(current)) best.set(row.userId, row)
    }
    return Array.from(best.values())
}
