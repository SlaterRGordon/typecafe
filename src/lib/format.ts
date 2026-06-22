// Render a number with at most 2 decimals, trailing zeros trimmed:
// 84 → "84", 84.5 → "84.5", 84.567 → "84.57", 84.50 → "84.5". Keeps stat
// readouts tidy instead of spilling long floats (e.g. minutes = seconds/60).
export function formatStat(value: number): string {
    if (!Number.isFinite(value)) return "0"
    return String(Math.round(value * 100) / 100)
}
