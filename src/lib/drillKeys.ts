// Single source of truth for which keys Practice and the drill page can target.
// Pure and in lib/ so diagnosis, the drill compiler, and the typer all agree on
// "drillable" without a component reaching across layers.

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
