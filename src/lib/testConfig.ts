export const TIMED_TEST_PRESETS = [15, 30, 60, 120] as const
export const WORD_TEST_PRESETS = [10, 25, 50, 100] as const
export const TIMED_SECONDS_MIN = 1
export const TIMED_SECONDS_MAX = 3_600

export type TestLengthKind = "timed" | "words"

export function isPresetTestLength(kind: TestLengthKind, count: number): boolean {
    const presets: readonly number[] = kind === "timed" ? TIMED_TEST_PRESETS : WORD_TEST_PRESETS
    return presets.includes(count)
}

export function isFiniteTimedSeconds(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= TIMED_SECONDS_MIN && (value as number) <= TIMED_SECONDS_MAX
}

/** Home and Practice share this exact custom-seconds clamp. */
export function normalizeTimedSeconds(value: string, fallback: number): number {
    const parsed = parseInt(value, 10)
    return Number.isNaN(parsed) ? fallback : Math.min(Math.max(parsed, TIMED_SECONDS_MIN), TIMED_SECONDS_MAX)
}
