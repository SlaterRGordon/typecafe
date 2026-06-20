// Guest score-history mirror in localStorage: local-first /progress from the
// first test, no account (locked constraint). Signed-in trends read the DB;
// this serves guests. Entries are validated on read because localStorage is
// user-editable. Sync-on-signup imports the same shape into DailyUserStat.
const KEY = "typecafe:progressHistory"
const CAP = 1000

export interface LocalProgressEntry {
    wpm: number
    accuracy: number
    c?: number // consistency 0-100, optional (older entries lack it)
    t: number // epoch ms
}

function storage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage
}

function sanitize(raw: unknown): LocalProgressEntry | null {
    if (!raw || typeof raw !== "object") return null
    const v = raw as Record<string, unknown>
    const ok = [v.wpm, v.accuracy, v.t].every((n) => typeof n === "number" && Number.isFinite(n))
    if (!ok) return null
    const c = typeof v.c === "number" && Number.isFinite(v.c) ? v.c : undefined
    return { wpm: v.wpm as number, accuracy: v.accuracy as number, c, t: v.t as number }
}

export function readLocalProgress(s = storage()): LocalProgressEntry[] {
    if (!s) return []
    try {
        const parsed = JSON.parse(s.getItem(KEY) ?? "[]") as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.map(sanitize).filter((e): e is LocalProgressEntry => e !== null)
    } catch {
        return []
    }
}

export function appendLocalProgress(entry: LocalProgressEntry, s = storage()): void {
    if (!s) return
    const next = [...readLocalProgress(s), entry].slice(-CAP)
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
