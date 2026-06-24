// Guest mirror of TransitionStat — local-first transition analytics with no
// account (locked constraint), same shape the DB stores so sync-on-signup is a
// straight batch-import. Mirrors localSync.ts for key stats.

import { mergeTransitions, type TransitionAggregate } from "./transitions"

export const LOCAL_TRANSITIONS_KEY = "typecafe:transitionStats"

function storage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage
}

function sanitize(raw: unknown): TransitionAggregate | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as Record<string, unknown>
    if (typeof v.pair !== "string" || !/^[a-z]{2}$/.test(v.pair)) return null
    const nums = [v.count, v.totalMs, v.errors]
    if (!nums.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) return null
    return { pair: v.pair, count: v.count as number, totalMs: v.totalMs as number, errors: v.errors as number }
}

export function readLocalTransitions(s = storage()): TransitionAggregate[] {
    if (!s) return []
    try {
        const parsed = JSON.parse(s.getItem(LOCAL_TRANSITIONS_KEY) ?? "[]") as unknown
        if (!Array.isArray(parsed)) return []
        return mergeTransitions([], parsed.map(sanitize).filter((a): a is TransitionAggregate => a !== null))
    } catch {
        return []
    }
}

export function writeLocalTransitions(aggs: TransitionAggregate[], s = storage()): boolean {
    if (!s) return false
    const merged = mergeTransitions([], aggs)
    try {
        if (merged.length === 0) s.removeItem(LOCAL_TRANSITIONS_KEY)
        else s.setItem(LOCAL_TRANSITIONS_KEY, JSON.stringify(merged))
        return true
    } catch {
        return false
    }
}

export function addLocalTransitions(aggs: TransitionAggregate[], s = storage()): boolean {
    if (!s) return false
    return writeLocalTransitions(mergeTransitions(readLocalTransitions(s), aggs), s)
}
