// A GitHub-style 365-day activity calendar built from raw test timestamps.
// Pure so /progress can derive it from the records already loaded (no extra
// query, works for guests local-first). One cell per day, newest day = today.

export interface ActivityDay {
    date: string // YYYY-MM-DD
    count: number
    level: number // 0–4 (react-activity-calendar intensity)
}

const MS_PER_DAY = 86_400_000
export const ACTIVITY_DAYS = 365

// Bucket counts into the same five intensities the profile calendar used.
function levelForCount(count: number): number {
    if (count > 6) return 4
    if (count > 4) return 3
    if (count > 2) return 2
    if (count > 0) return 1
    return 0
}

export function buildActivityCalendar(
    timestamps: number[],
    now: Date,
): { data: ActivityDay[]; total: number } {
    const counts = new Map<string, number>()
    for (const t of timestamps) {
        const key = new Date(t).toISOString().slice(0, 10)
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const data: ActivityDay[] = []
    let total = 0
    for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
        const key = new Date(now.getTime() - i * MS_PER_DAY).toISOString().slice(0, 10)
        const count = counts.get(key) ?? 0
        total += count
        data.push({ date: key, count, level: levelForCount(count) })
    }
    return { data, total }
}
