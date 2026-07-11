// Shared shape behind the guest localStorage mirrors (key stats, transitions):
// a JSON array under one key, validated on read (localStorage is user-editable)
// and folded by a domain merge. Each mirror supplies its own `sanitize` (one
// record) and `merge` (the dedupe/sum/sort that encodes its semantics); this
// owns the read/write/add/clear plumbing once. progressHistory stays separate -
// it's append+cap, not a merge.

function defaultStorage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage
}

export interface KeyedStore<T> {
    read(s?: Storage): T[]
    write(items: T[], s?: Storage): boolean
    add(items: T[], s?: Storage): boolean
    clear(s?: Storage): boolean
}

export function createKeyedStore<T>(
    key: string,
    sanitize: (raw: unknown) => T | null,
    merge: (existing: T[], incoming: T[]) => T[],
): KeyedStore<T> {
    function read(s = defaultStorage()): T[] {
        if (!s) return []
        try {
            const parsed = JSON.parse(s.getItem(key) ?? "[]") as unknown
            if (!Array.isArray(parsed)) return []
            return merge([], parsed.map(sanitize).filter((x): x is T => x !== null))
        } catch {
            return []
        }
    }

    function write(items: T[], s = defaultStorage()): boolean {
        if (!s) return false
        const merged = merge([], items)
        try {
            if (merged.length === 0) s.removeItem(key)
            else s.setItem(key, JSON.stringify(merged))
            return true
        } catch {
            return false
        }
    }

    function add(items: T[], s = defaultStorage()): boolean {
        if (!s) return false
        return write(merge(read(s), items), s)
    }

    function clear(s = defaultStorage()): boolean {
        if (!s) return false
        try {
            s.removeItem(key)
            return true
        } catch {
            return false
        }
    }

    return { read, write, add, clear }
}
