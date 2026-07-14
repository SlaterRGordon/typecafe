// Guest score-history mirror in localStorage: local-first /progress from the
// first test, no account (locked constraint). Signed-in trends read the DB;
// this serves guests. Entries are validated on read because localStorage is
// user-editable. Sync-on-signup imports the same shape into DailyUserStat.
// v2 stores canonical net WPM. Entries without a version are the legacy raw
// WPM shape and are converted on read using their saved accuracy.
import { netFromRaw } from "./stats"

const KEY = "typecafe:progressHistory"
const CAP = 1000

export interface LocalProgressEntry {
    v: 2
    wpm: number
    accuracy: number
    c?: number // consistency 0-100, optional (older entries lack it)
    t: number // epoch ms
    lang?: string // base language; older entries lack it → treated as English on read
    layout?: string // actual layout id (honesty tag, ledger decision 10); older entries lack it → qwerty
}

export type NewLocalProgressEntry = Omit<LocalProgressEntry, "v">

function storage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage
}

function sanitize(raw: unknown): LocalProgressEntry | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as Record<string, unknown>
    const ok = [v.wpm, v.accuracy, v.t].every((n) => typeof n === "number" && Number.isFinite(n))
    if (!ok) return null
    const c = typeof v.c === "number" && Number.isFinite(v.c) ? v.c : undefined
    const lang = typeof v.lang === "string" ? v.lang : undefined
    const layout = typeof v.layout === "string" ? v.layout : undefined
    const version = v.v
    if (version !== undefined && version !== 2) return null
    const accuracy = v.accuracy as number
    const wpm = version === 2 ? v.wpm as number : netFromRaw(v.wpm as number, accuracy)
    return { v: 2, wpm, accuracy, c, t: v.t as number, lang, layout }
}

export function readLocalProgress(s = storage()): LocalProgressEntry[] {
    if (!s) return []
    try {
        const parsed = JSON.parse(s.getItem(KEY) ?? "[]") as unknown
        if (!Array.isArray(parsed)) return []
        // Cap on read too, not just on write: a hand-edited (user-editable)
        // localStorage could hold more than CAP, and sync-on-signup rejects a
        // batch over the server limit - which would silently never clear and retry
        // forever. Keeping the newest CAP keeps that path bounded.
        return parsed.map(sanitize).filter((e): e is LocalProgressEntry => e !== null).slice(-CAP)
    } catch {
        return []
    }
}

export function appendLocalProgress(entry: NewLocalProgressEntry, s = storage()): void {
    if (!s) return
    const next = [...readLocalProgress(s), { v: 2 as const, ...entry }].slice(-CAP)
    try {
        s.setItem(KEY, JSON.stringify(next))
    } catch {
        // Storage full or unavailable: the guest trend just will not grow.
    }
}

export function clearLocalProgress(s = storage()): void {
    if (!s) return
    s.removeItem(KEY)
}
