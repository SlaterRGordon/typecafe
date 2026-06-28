// Guest mirror of TransitionStat — local-first transition analytics with no
// account (locked constraint), same shape the DB stores so sync-on-signup is a
// straight batch-import. Mirrors localSync.ts for key stats.

import { createKeyedStore } from "./keyedStore"
import { mergeTransitions, type TransitionAggregate } from "./transitions"

export const LOCAL_TRANSITIONS_KEY = "typecafe:transitionStats"

function sanitize(raw: unknown): TransitionAggregate | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as Record<string, unknown>
    if (typeof v.pair !== "string" || !/^[a-z]{2}$/.test(v.pair)) return null
    const nums = [v.count, v.totalMs, v.errors]
    if (!nums.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) return null
    return { pair: v.pair, count: v.count as number, totalMs: v.totalMs as number, errors: v.errors as number }
}

const store = createKeyedStore(LOCAL_TRANSITIONS_KEY, sanitize, mergeTransitions)

export const readLocalTransitions = store.read
export const writeLocalTransitions = store.write
export const addLocalTransitions = store.add
// Exported for the sync-on-sign-in import (candidate #01).
export const clearLocalTransitions = store.clear
