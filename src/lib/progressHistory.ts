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
    lang?: string // base language; older entries lack it → treated as English on read
    layout?: string // actual layout id (honesty tag, ledger decision 10); older entries lack it → qwerty
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
    const lang = typeof v.lang === "string" ? v.lang : undefined
    const layout = typeof v.layout === "string" ? v.layout : undefined
    return { wpm: v.wpm as number, accuracy: v.accuracy as number, c, t: v.t as number, lang, layout }
}

export function readLocalProgress(s = storage()): LocalProgressEntry[] {
    if (!s) return []
    try {
        const parsed = JSON.parse(s.getItem(KEY) ?? "[]") as unknown
        if (!Array.isArray(parsed)) return []
        // Cap on read too, not just on write: a hand-edited (user-editable)
        // localStorage could hold more than CAP, and sync-on-signup rejects a
        // batch over the server limit — which would silently never clear and retry
        // forever. Keeping the newest CAP keeps that path bounded.
        return parsed.map(sanitize).filter((e): e is LocalProgressEntry => e !== null).slice(-CAP)
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
