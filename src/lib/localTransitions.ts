// Guest mirror of TransitionStat - local-first transition analytics with no
// account (locked constraint), same shape the DB stores so sync-on-signup is a
// straight batch-import. Mirrors localSync.ts for key stats.

import { createKeyedStore, type KeyedStore } from "./keyedStore"
import { mergeTransitions, type TransitionAggregate } from "./transitions"

export const LOCAL_TRANSITIONS_KEY = "typecafe:transitionStats"

function sanitize(raw: unknown): TransitionAggregate | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as Record<string, unknown>
    if (typeof v.pair !== "string" || !/^[a-z ]{2}$/.test(v.pair)) return null
    const nums = [v.count, v.totalMs, v.errors]
    if (!nums.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) return null
    return { pair: v.pair, count: v.count as number, totalMs: v.totalMs as number, errors: v.errors as number }
}

// Keyed per stats pool like localSync: the legacy unsuffixed key IS the
// qwerty pool; remap pools live under suffixed keys.
const stores: Record<string, KeyedStore<TransitionAggregate>> = {}

function storeFor(pool: string) {
    const key = pool === "qwerty" ? LOCAL_TRANSITIONS_KEY : `${LOCAL_TRANSITIONS_KEY}:${pool}`
    return (stores[key] ??= createKeyedStore(key, sanitize, mergeTransitions))
}

export const readLocalTransitions = (pool = "qwerty", s?: Storage) => storeFor(pool).read(s)
export const writeLocalTransitions = (items: TransitionAggregate[], pool = "qwerty", s?: Storage) => storeFor(pool).write(items, s)
export const addLocalTransitions = (items: TransitionAggregate[], pool = "qwerty", s?: Storage) => storeFor(pool).add(items, s)
// Exported for the sync-on-sign-in import (candidate #01).
export const clearLocalTransitions = (pool = "qwerty", s?: Storage) => storeFor(pool).clear(s)
