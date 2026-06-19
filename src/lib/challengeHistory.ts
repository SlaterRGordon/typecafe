import { challengeStreakFromDateKeys, shiftChallengeDateKey } from "./challenge"

const KEY = "typecafe:challengeHistory"
const CAP = 120

export interface LocalChallengeEntry {
    dateKey: string
    wpm: number
    accuracy: number
    t: number
}

export interface ChallengeStatus {
    today: LocalChallengeEntry | null
    yesterday: LocalChallengeEntry | null
    streak: number
}

function storage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage
}

function sanitize(raw: unknown): LocalChallengeEntry | null {
    if (!raw || typeof raw !== "object") return null
    const value = raw as Record<string, unknown>
    if (typeof value.dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.dateKey)) return null
    const ok = [value.wpm, value.accuracy, value.t].every((n) => typeof n === "number" && Number.isFinite(n))
    if (!ok) return null
    return { dateKey: value.dateKey, wpm: value.wpm as number, accuracy: value.accuracy as number, t: value.t as number }
}

export function readLocalChallengeHistory(s = storage()): LocalChallengeEntry[] {
    if (!s) return []
    try {
        const parsed = JSON.parse(s.getItem(KEY) ?? "[]") as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.map(sanitize).filter((entry): entry is LocalChallengeEntry => entry !== null)
    } catch {
        return []
    }
}

export function recordLocalChallenge(entry: LocalChallengeEntry, s = storage()): void {
    if (!s) return
    const existing = readLocalChallengeHistory(s).filter((item) => item.dateKey !== entry.dateKey)
    const next = [...existing, entry].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).slice(-CAP)
    try {
        s.setItem(KEY, JSON.stringify(next))
    } catch {
        // storage full or unavailable - the guest challenge status just won't persist
    }
}

export function localChallengeStatus(todayKey: string, entries: LocalChallengeEntry[]): ChallengeStatus {
    const byDay = new Map(entries.map((entry) => [entry.dateKey, entry]))
    return {
        today: byDay.get(todayKey) ?? null,
        yesterday: byDay.get(shiftChallengeDateKey(todayKey, -1)) ?? null,
        streak: challengeStreakFromDateKeys(entries.map((entry) => entry.dateKey), todayKey),
    }
}
