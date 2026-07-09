// Single source of truth for which keys Practice and the drill page can target.
// Pure and in lib/ so diagnosis, the drill compiler, and the typer all agree on
// "drillable" without a component reaching across layers.

import { worstKeysFromAttempts } from "./stats"

// Punctuation the drill sprinkles at word boundaries, split by where it lands in
// a sentence (enders close a clause; mids sit between words).
export const ENDER_MARKS = ['.', '?', '!']
export const MID_MARKS = [',', ';', ':', '-']
export const DRILL_MARKS = [...ENDER_MARKS, ...MID_MARKS]

export const isDrillMark = (key: string) => DRILL_MARKS.includes(key)
export const isDrillDigit = (key: string) => /^[0-9]$/.test(key)

// One drillable key: a lowercase letter, a digit, or a drill mark. Capitals fold
// to their base letter before this check — capitals are diagnosed but not drilled
// directly (the shift motion rides on the base key), so they're not their own key.
export const isDrillableKey = (key: string) =>
    /^[a-z]$/.test(key) || isDrillDigit(key) || isDrillMark(key)

const VOWELS = "aeiou"

// Practice accepts lowercase Unicode letters. Decomposing covers the accented
// vowels used by the shipped language lists (ü → u, é → e, ą → a) without a
// locale table; every other letter is a consonant for the generation floor.
export const isPracticeLetter = (key: string) => /^\p{Ll}$/u.test(key)
export const isPracticeVowel = (key: string) =>
    isPracticeLetter(key) && VOWELS.includes(key.normalize("NFD")[0] ?? "")

// Build a practice set from the user's eight least-accurate keys across letters,
// numbers, punctuation, and the language's accent chars. Weak letters —
// including accents — anchor word generation, padded with home-row keys and
// balanced for two vowels and a consonant. Numbers/punctuation ride along as
// extra drill targets; a dead-composed char like ê counts as itself, while its
// reps ride the ^ cell on the board. Null
// when there isn't enough typing data yet.
// minAttempts 3 matches the /progress "weakest keys" list, so smart drill
// targets exactly the keys shown as weak there.
// `accents`: the language's accent chars typeable on the active layout — the
// caller owns that intersection (language and layout live above lib/).
export function smartDrillSelection(
    attempts: ReadonlyMap<string, { attempts: number, correct: number }>,
    accents: readonly string[] = [],
): string[] | null {
    const accentSet = new Set(accents)
    const drillable = new Map<string, { attempts: number, correct: number }>()
    for (const [key, value] of attempts) {
        if (isDrillableKey(key) || accentSet.has(key)) drillable.set(key, value)
    }

    const worst = worstKeysFromAttempts(drillable, 8, 3)
    if (worst.length === 0) return null
    const worstKeys = worst.map((entry) => entry.key)

    // Letters anchor word-gen: accents are letters too, so weak ü/é/ą can
    // displace an a–z filler and shape the actual Practice text.
    const letters = worstKeys.filter(isPracticeLetter)
    for (const key of "asdfghjkleiou") {
        if (letters.length >= 8) break
        if (!letters.includes(key)) letters.push(key)
    }
    // Word generation needs variety: guarantee at least two vowels and one
    // consonant, swapping the trailing (least-weak) slots if short.
    const ensureMin = (pool: string, wanted: (key: string) => boolean, min: number) => {
        for (let i = letters.length - 1; i >= 0 && letters.filter(wanted).length < min; i--) {
            if (wanted(letters[i]!)) continue
            const fill = pool.split("").find((f) => !letters.includes(f))
            if (fill) letters[i] = fill
        }
    }
    ensureMin("eaiou", isPracticeVowel, 2)
    ensureMin("tnshr", (key) => isPracticeLetter(key) && !isPracticeVowel(key), 1)

    const extras = worstKeys.filter((key) => isDrillDigit(key) || isDrillMark(key))
    return [...letters, ...extras]
}
