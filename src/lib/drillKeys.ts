// Single source of truth for which keys Practice and the drill page can target.
// Pure and in lib/ so diagnosis, the drill compiler, and the typer all agree on
// "drillable" without a component reaching across layers.

import { worstKeysFromAttempts } from "./stats"
import { boardFor, composedFor, keyFor, sequenceFor, type KeyCap, type Layer } from "./keyboardLayout"

// Punctuation the drill sprinkles at word boundaries, split by where it lands in
// a sentence (enders close a clause; mids sit between words).
export const ENDER_MARKS = ['.', '?', '!']
export const MID_MARKS = [',', ';', ':', '-']
export const DRILL_MARKS = [...ENDER_MARKS, ...MID_MARKS]

export const isDrillMark = (key: string) => DRILL_MARKS.includes(key)
export const isDrillDigit = (key: string) => /^[0-9]$/.test(key)
// The full digit pool the numbers toggle sprinkles into normal-mode text.
export const ALL_DIGITS = "0123456789".split("")

// One drillable key: a lowercase letter, a digit, or a drill mark. Capitals fold
// to their base letter before this check - capitals are diagnosed but not drilled
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


// Weak-key surfaces (progress, coach tab) only show keys the user can drill
// *right now*: ASCII drillables plus the active language's accent chars, and
// typeable on the active layout. Case-folds so a weak 'R' follows its base key.
export function isDrillableOn(key: string, layout: string, accents: readonly string[]): boolean {
    const base = key.toLowerCase()
    return (isDrillableKey(base) || accents.includes(base)) && sequenceFor(key, layout).length > 0
}

const LAYERS: readonly Layer[] = ["base", "shift", "altgr", "shiftAltgr"]
const isAsciiLetter = (key: string) => /^[a-z]$/.test(key)
const tokenKind = (key: string, accents: ReadonlySet<string>) =>
    isDrillDigit(key) ? "digit" : isDrillMark(key) ? "mark" : (isAsciiLetter(key) || accents.has(key)) && isPracticeLetter(key) ? "letter" : null
const glyphOn = (cap: KeyCap, layer: Layer) => cap[layer] ?? (layer === "shiftAltgr" ? cap.altgr : undefined)
const physicalOffset = (shape: "ansi" | "iso", row: number) => shape === "iso" && row === 3 ? 1 : 0

// Rebase a Practice selection when its board changes. Characters name output;
// practice trains physical caps, so each selected cap carries to the matching
// ANSI/ISO-adjusted position and keeps its kind (letter, digit, or mark) where
// the target cap offers one. Dead target caps select their language's whole
// composed set. Off-board targets drop; repairPracticeSelection restores a
// text-generating floor afterwards.
export function remapPracticeSelectionByPosition(
    selected: readonly string[],
    fromLayout: string,
    toLayout: string,
    accents: readonly string[],
): string[] {
    const from = boardFor(fromLayout)
    const to = boardFor(toLayout)
    const accentSet = new Set(accents)
    const out: string[] = []
    const add = (key: string) => { if (!out.includes(key)) out.push(key) }
    for (const selectedKey of selected) {
        const source = keyFor(selectedKey, fromLayout)
        if (!source) continue
        let position: readonly [number, number] | undefined
        for (let row = 0; row < from.rows.length && !position; row++) {
            const col = from.rows[row]!.findIndex((cap) => cap.base === source)
            if (col >= 0) position = [row, col - physicalOffset(from.shape, row)]
        }
        if (!position) continue
        const [row, physicalCol] = position
        const target = to.rows[row]?.[physicalCol + physicalOffset(to.shape, row)]
        if (!target) continue
        const sourceStep = sequenceFor(selectedKey, fromLayout)[0]
        const preferred: Layer = sourceStep?.shift && sourceStep.altgr ? "shiftAltgr" : sourceStep?.altgr ? "altgr" : sourceStep?.shift ? "shift" : "base"
        const wanted = isPracticeLetter(selectedKey) ? "letter" : isDrillDigit(selectedKey) ? "digit" : isDrillMark(selectedKey) ? "mark" : null
        for (const layer of [preferred, ...LAYERS.filter((candidate) => candidate !== preferred)]) {
            const glyph = glyphOn(target, layer)
            if (!glyph) continue
            if (tokenKind(glyph, accentSet) === wanted) { add(glyph); break }
            if (wanted === "letter") {
                const composed = composedFor(glyph, toLayout).filter((char) => accentSet.has(char))
                if (composed.length > 0) { composed.forEach(add); break }
            }
        }
    }
    return out
}

// Persisted settings can predate a language/layout switch. Keep every typeable
// selected token, then minimally repair the letter floor so Practice always has
// words to build - especially after an accent-only set returns to English.
export function repairPracticeSelection(selected: readonly string[], layout: string, accents: readonly string[]): string[] {
    const accentSet = new Set(accents)
    const out = [...new Set(selected.filter((key) => tokenKind(key, accentSet) !== null && sequenceFor(key, layout).length > 0))]
    const letters = () => out.filter((key) => tokenKind(key, accentSet) === "letter")
    const add = (key: string) => { if (!out.includes(key)) out.push(key) }
    const available = (key: string) => sequenceFor(key, layout).length > 0
    for (const vowel of "aeiou") {
        if (letters().filter(isPracticeVowel).length >= 2) break
        if (available(vowel)) add(vowel)
    }
    for (const consonant of "tnshr") {
        if (letters().some((key) => !isPracticeVowel(key))) break
        if (available(consonant)) add(consonant)
    }
    for (const letter of "asdfghjklqwertyuiopzxcvbnm") {
        if (letters().length >= 8) break
        if (available(letter)) add(letter)
    }
    return out
}
// Build a practice set from the user's eight least-accurate keys across letters,
// numbers, punctuation, and the language's accent chars. Weak letters -
// including accents - anchor word generation, padded with home-row keys and
// balanced for two vowels and a consonant. Numbers/punctuation ride along as
// extra drill targets; a dead-composed char like ê counts as itself, while its
// reps ride the ^ cell on the board. Null
// when there isn't enough typing data yet.
// minAttempts 3 matches the /progress "weakest keys" list, so smart drill
// targets exactly the keys shown as weak there.
// `accents`: the language's accent chars typeable on the active layout - the
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
