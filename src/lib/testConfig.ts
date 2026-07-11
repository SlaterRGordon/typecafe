export const TIMED_TEST_PRESETS = [15, 30, 60, 120] as const
export const WORD_TEST_PRESETS = [10, 25, 50, 100] as const

export type TestLengthKind = "timed" | "words"

export function isPresetTestLength(kind: TestLengthKind, count: number): boolean {
    const presets: readonly number[] = kind === "timed" ? TIMED_TEST_PRESETS : WORD_TEST_PRESETS
    return presets.includes(count)
}
