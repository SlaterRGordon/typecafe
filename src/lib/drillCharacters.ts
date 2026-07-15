// Shallow character vocabulary shared by URL parsing and the full drill compiler.
// Keep this module free of keyboard geometry so callers do not pay for layouts.
export const ENDER_MARKS = [".", "?", "!"]
export const MID_MARKS = [",", ";", ":", "-"]
export const DRILL_MARKS = [...ENDER_MARKS, ...MID_MARKS]

export const isDrillMark = (key: string) => DRILL_MARKS.includes(key)
export const isDrillDigit = (key: string) => /^[0-9]$/.test(key)
export const ALL_DIGITS = "0123456789".split("")

export const isDrillableKey = (key: string) =>
    /^[a-z]$/.test(key) || isDrillDigit(key) || isDrillMark(key)

const VOWELS = "aeiou"

export const isPracticeLetter = (key: string) => /^\p{Ll}$/u.test(key)
export const isPracticeVowel = (key: string) =>
    isPracticeLetter(key) && VOWELS.includes(key.normalize("NFD")[0] ?? "")
