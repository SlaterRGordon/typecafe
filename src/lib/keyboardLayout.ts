// Keyboard layout primitive: the pure data behind the global layout setting
// (docs/features/keyboard-layouts.md). React-free and unit-tested, same shape
// as heatmap.ts. A layout is just where the glyphs sit — all five arrange the
// same ANSI glyph set, so heatmap.ts's shift pairing and per-char folding stay
// layout-independent; only board rows and the train ladder's key stages derive
// from here. Display/teaching only: input stays e.key, the OS does any remapping.

export const DEFAULT_LAYOUT = "qwerty"

// Four visual rows per layout (number row + three letter rows), ANSI shape,
// matching heatmap.ts HEATMAP_ROWS. The qwerty entry is the single source of
// truth HEATMAP_ROWS re-exports.
const LAYOUT_ROWS: Record<string, readonly [string, string, string, string]> = {
    qwerty: ["1234567890-=\\", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"],
    dvorak: ["1234567890[]\\", "',.pyfgcrl/=", "aoeuidhtns-", ";qjkxbmwvz"],
    colemak: ["1234567890-=\\", "qwfpgjluy;[]", "arstdhneio'", "zxcvbkm,./"],
    "colemak-dh": ["1234567890-=\\", "qwfpbjluy;[]", "arstgmneio'", "zxcdvkh,./"],
    workman: ["1234567890-=\\", "qdrwbjfup;[]", "ashtgyneoi'", "zxmcvkl,./"],
}

// Ordered as offered in the nav menu: the default first, then by adoption.
export const LAYOUTS: string[] = ["qwerty", "colemak", "colemak-dh", "dvorak", "workman"]

// Rows for board rendering. Unknown names (corrupt storage) fall back to qwerty.
export function rowsFor(layout: string): readonly string[] {
    return LAYOUT_ROWS[layout] ?? LAYOUT_ROWS[DEFAULT_LAYOUT]!
}

// The train ladder's home-row-out order as physical positions ([row, column]
// into rowsFor), one group per stage. Chosen so qwerty reproduces the
// hand-authored KEY_STAGES it replaces (levels.ts); every layout gets the same
// pedagogy — resting fingers first, then inner columns, outward, bottom row last.
const TOP = 1, HOME = 2, BOTTOM = 3
const STAGE_POSITIONS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[HOME, 0], [HOME, 1], [HOME, 2], [HOME, 3], [HOME, 6], [HOME, 7], [HOME, 8], [HOME, 9]],
    [[HOME, 4], [HOME, 5]],
    [[TOP, 2], [TOP, 7]],
    [[TOP, 3], [TOP, 6]],
    [[TOP, 4], [TOP, 5]],
    [[TOP, 1], [TOP, 8]],
    [[TOP, 0], [TOP, 9]],
    [[BOTTOM, 2], [BOTTOM, 5]],
    [[BOTTOM, 3], [BOTTOM, 6]],
    [[BOTTOM, 4]],
]

const isLetter = (ch: string) => ch >= "a" && ch <= "z"

// Cumulative key stages for the train ladder (11 per layout, the shape
// KEY_STAGES had). Positions holding non-letters in a layout are skipped
// (qwerty drops ";" from the resting fingers, dvorak its top-row punctuation),
// and the final stage sweeps the remaining letter positions so every layout
// introduces all 26 letters.
export function keyStagesFor(layout: string): string[] {
    const rows = rowsFor(layout)
    const stages: string[] = []
    let keys = ""
    for (const group of STAGE_POSITIONS) {
        for (const [row, col] of group) {
            const ch = rows[row]?.[col] ?? ""
            if (isLetter(ch)) keys += ch
        }
        stages.push(keys)
    }
    const have = new Set(keys)
    const rest = rows.slice(1).join("").split("").filter((ch) => isLetter(ch) && !have.has(ch))
    stages.push(keys + rest.join(""))
    return stages
}
