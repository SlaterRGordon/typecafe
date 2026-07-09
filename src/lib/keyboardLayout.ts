// Keyboard-layout geometry: the one deep module that owns where keys live and
// what they produce (docs/features/keyboard-layouts.md, decision 2). Pure and
// React-free. Everything key-shaped derives from the layout table below:
// boards for rendering (glyphs per layer, dead flags, ANSI/ISO shape), char →
// physical-key folding for the heatmap, char → keystroke sequences for
// teaching, the train ladder's key stages, and the stats-pool dimension.
// Display/teaching only: input stays e.key, the OS does any remapping.
//
// Interface facts callers may rely on: every function is total (unknown layout
// falls back to qwerty; unmappable chars return null/[]), qwerty outputs are
// pinned to the pre-geometry behavior byte-for-byte, and sequences are at most
// two steps (dead key + base). Layout data typos throw at module load, so a
// bad table can't ship past the unit suite.

export const DEFAULT_LAYOUT = "qwerty"

export type Layer = "base" | "shift" | "altgr" | "shiftAltgr"

export interface KeyCap {
    readonly base: string
    readonly shift: string
    readonly altgr?: string
    readonly shiftAltgr?: string
    // Layers on which this cap is a dead key (waits for the next press).
    readonly dead?: readonly Layer[]
}

export interface Board {
    readonly shape: "ansi" | "iso"
    readonly rows: ReadonlyArray<readonly KeyCap[]>
}

// One keystroke of a teaching sequence: which physical key (named by its base
// glyph) plus the modifiers held. `dead` marks a dead-key press awaiting the
// next stroke — the board renders those as numbered steps.
export interface Step {
    readonly key: string
    readonly shift?: boolean
    readonly altgr?: boolean
    readonly dead?: boolean
}

// ---------------------------------------------------------------------------
// Layout data. Two authoring formats per row:
//   - no spaces: one char per key, base layer only (the five remap layouts —
//     kept byte-identical to their pre-geometry strings). Shift derives from
//     uppercase for letters and the shared ANSI pair table for symbols.
//   - space-separated tokens (national layouts): each token is one key's
//     layers in order. Letters derive shift=uppercase, so their 2nd char is
//     AltGr ("e€"). Non-letters author shift explicitly: base, shift, altgr,
//     shiftAltgr ("0=}" = base 0, shift =, AltGr }). ß counts as non-letter
//     here (its uppercase is "SS"), so "ß?\\" reads shift ?, AltGr \.
// `dead` lists the layout's dead glyphs; any cap layer producing one gets the
// dead flag. Compose (dead + base → composed) is the shared table below —
// scoped to chars our languages actually use, not full Unicode.

interface LayoutSpec {
    readonly shape: "ansi" | "iso"
    // True remaps (Dvorak, Colemak…) retrain fingers and get their own stats
    // pool; national layouts re-describe the hardware users already type on
    // and share the legacy qwerty pool (ledger decision 6).
    readonly remap?: boolean
    readonly rows: readonly [string, string, string, string]
    readonly dead?: string
    // Authored layer exceptions, keyed by base glyph: [shift, altgr?,
    // shiftAltgr?]. For keys whose auto-derivation is wrong — AZERTY's number
    // row puts digits on the *shift* layer of its accent letters (é → 2), which
    // the letters-uppercase rule can't express.
    readonly overrides?: Record<string, readonly string[]>
}

const SPECS: Record<string, LayoutSpec> = {
    qwerty: { shape: "ansi", rows: ["1234567890-=\\", "qwertyuiop[]", "asdfghjkl;'", "zxcvbnm,./"] },
    dvorak: { shape: "ansi", remap: true, rows: ["1234567890[]\\", "',.pyfgcrl/=", "aoeuidhtns-", ";qjkxbmwvz"] },
    colemak: { shape: "ansi", remap: true, rows: ["1234567890-=\\", "qwfpgjluy;[]", "arstdhneio'", "zxcvbkm,./"] },
    "colemak-dh": { shape: "ansi", remap: true, rows: ["1234567890-=\\", "qwfpbjluy;[]", "arstgmneio'", "zxcdvkh,./"] },
    workman: { shape: "ansi", remap: true, rows: ["1234567890-=\\", "qdrwbjfup;[]", "ashtgyneoi'", "zxmcvkl,./"] },
    // German T1 (DIN 2137).
    "qwertz-de": {
        shape: "iso",
        rows: [
            "^° 1! 2\"² 3§³ 4$ 5% 6& 7/{ 8([ 9)] 0=} ß?\\ ´`",
            "q@ w e€ r t z u i o p ü +*~",
            "a s d f g h j k l ö ä #'",
            "<>| y x c v b n mµ ,; .: -_",
        ],
        dead: "^´`",
    },
    // National layouts below are transcribed from the Windows/CLDR references.
    // French AZERTY (FR). The number row puts digits on shift — the `overrides`
    // exceptions, since accent letters can't derive that.
    "azerty-fr": {
        shape: "iso",
        rows: [
            "² &1 é \"3# '4{ (5[ -6| è _8\\ ç à )°] =+}",
            "a z e€ r t y u i o p ^¨ $£",
            "q s d f g h j k l m ù *µ",
            "<> w x c v b n ,? ;. :/ !§",
        ],
        dead: "^¨",
        overrides: { "é": ["2", "~"], "è": ["7", "`"], "ç": ["9"], "à": ["0", "@"], "ù": ["%"] },
    },
    // Spanish (Spain).
    "qwerty-es": {
        shape: "iso",
        rows: [
            "ºª\\ 1!| 2\"@ 3·# 4$~ 5% 6& 7/ 8( 9) 0= '? ¡¿",
            "q w e€ r t y u i o p `^[ +*]",
            "a s d f g h j k l ñ ´¨{ ç}",
            "<> z x c v b n m ,; .: -_",
        ],
        dead: "`´^¨",
    },
    // Spanish (Latin America).
    "qwerty-latam": {
        shape: "iso",
        rows: [
            "|°¬ 1! 2\" 3# 4$ 5% 6& 7/ 8( 9) 0= '?\\ ¿¡",
            "q w e€ r t y u i o p ´¨ +*~",
            "a s d f g h j k l ñ {[ }]",
            "<> z x c v b n m ,; .: -_",
        ],
        dead: "´¨",
    },
    // Italian. No dead keys — accented vowels are direct caps (é is shift+è).
    "qwerty-it": {
        shape: "iso",
        rows: [
            "\\| 1! 2\" 3£ 4$ 5% 6& 7/ 8( 9) 0= '? ì",
            "q w e€ r t y u i o p è +*]",
            "a s d f g h j k l ò à ù",
            "<> z x c v b n m ,; .: -_",
        ],
        overrides: { "ì": ["^"], "è": ["é", "["], "ò": ["ç", "@"], "à": ["°", "#"], "ù": ["§"] },
    },
    // Portuguese (Portugal).
    "qwerty-pt": {
        shape: "iso",
        rows: [
            "\\| 1! 2\"@ 3#£ 4$§ 5% 6& 7/{ 8([ 9)] 0=} '? «»",
            "q w e€ r t y u i o p +* ´`",
            "a s d f g h j k l ç ºª ~^",
            "<> z x c v b n m ,; .: -_",
        ],
        dead: "´`~^",
    },
    // Brazilian ABNT2. ponytail: its second extra key (/? right of shift) is
    // out of scope — `shape` only models ansi/iso (ledger upgrade path 5), so
    // / stays untypeable on this board until that shape ships.
    "qwerty-abnt2": {
        shape: "iso",
        rows: [
            "'\" 1! 2@ 3# 4$ 5% 6¨ 7& 8* 9( 0) -_ =+",
            "q w e€ r t y u i o p ´` [{",
            "a s d f g h j k l ç ~^ ]}",
            "\\| z x c v b n m ,< .> ;:",
        ],
        dead: "´`~^¨",
    },
    // UK (BS 4822-ish Windows layout).
    "qwerty-uk": {
        shape: "iso",
        rows: [
            "`¬¦ 1! 2\" 3£ 4$€ 5% 6^ 7& 8* 9( 0) -_ =+",
            "q w e r t y u i o p [{ ]}",
            "a s d f g h j k l ;: '@ #~",
            "\\| z x c v b n m ,< .> /?",
        ],
    },
    // US International: qwerty plus five dead keys (the Netherlands standard).
    "qwerty-us-intl": {
        shape: "ansi",
        rows: [
            "`~ 1! 2@ 3# 4$ 5% 6^ 7& 8* 9( 0) -_ =+ \\|",
            "q w e r t y u i o p [ ]",
            "a s d f g h j k l ; '",
            "z x c v b n m , . /",
        ],
        dead: "'\"`~^",
    },
    // Polish (programmers): US QWERTY plus AltGr accents.
    "qwerty-pl": {
        shape: "ansi",
        rows: [
            "1 2 3 4 5 6 7 8 9 0 - = \\",
            "q w eę r t y u i oó p [ ]",
            "aą sś d f g h j k lł ; '",
            "zż xź cć v b nń m , . /",
        ],
    },
}

// The IDs the geometry knows (picker availability is a separate, narrower
// list — PICKER_LAYOUTS below).
export const LAYOUT_IDS: string[] = Object.keys(SPECS)

// Shift twins shared by every ANSI remap layout (glyph-keyed: Dvorak's / still
// shifts to ?). The single source the parser derives symbol shifts from.
const ANSI_SHIFT: Record<string, string> = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
    "6": "^", "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+",
    ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?",
    "[": "{", "]": "}", "\\": "|",
}

// Dead-key composition, shared across layouts (´+e is é on any hardware; a
// glyph composes identically wherever it's dead). Only chars our offered
// languages use — grows with the layout catalog. The ' and " rows serve
// US-International, whose apostrophe/quote caps are dead acute/diaeresis.
const COMPOSE: Record<string, Record<string, string>> = {
    "´": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý" },
    "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý" },
    "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù" },
    "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
    "¨": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü" },
    "\"": { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü" },
    "~": { a: "ã", n: "ñ", o: "õ" },
}

// Uppercase-derived shift glyph, or null when the char doesn't single-char
// uppercase (symbols, digits, ß → "SS").
function derivedShift(ch: string): string | null {
    const upper = ch.toUpperCase()
    return ch.toLowerCase() === ch && upper !== ch && upper.length === 1 ? upper : null
}

function parseToken(token: string): KeyCap {
    const chars = [...token]
    const base = chars[0]!
    const auto = derivedShift(base)
    const shift = auto ?? chars[1] ?? ANSI_SHIFT[base] ?? base
    const altgr = auto ? chars[1] : chars[2]
    const shiftAltgr = auto ? chars[2] : chars[3]
    return {
        base,
        shift,
        ...(altgr !== undefined ? { altgr } : {}),
        ...(shiftAltgr !== undefined ? { shiftAltgr } : {}),
    }
}

function parseRow(row: string): KeyCap[] {
    const tokens = row.includes(" ") ? row.split(" ") : [...row]
    return tokens.map(parseToken)
}

const LAYERS: readonly Layer[] = ["base", "shift", "altgr", "shiftAltgr"]

function buildBoard(spec: LayoutSpec): Board {
    const deadGlyphs = new Set([...(spec.dead ?? "")])
    const rows = spec.rows.map((row) =>
        parseRow(row).map((cap) => {
            const override = spec.overrides?.[cap.base]
            if (override) {
                const [shift, altgr, shiftAltgr] = override
                cap = {
                    base: cap.base,
                    shift: shift ?? cap.shift,
                    ...(altgr !== undefined ? { altgr } : {}),
                    ...(shiftAltgr !== undefined ? { shiftAltgr } : {}),
                }
            }
            const dead = LAYERS.filter((layer) => {
                const glyph = cap[layer]
                return glyph !== undefined && deadGlyphs.has(glyph)
            })
            return dead.length > 0 ? { ...cap, dead } : cap
        }),
    )
    return { shape: spec.shape, rows }
}

// ---------------------------------------------------------------------------
// Derived geometry, built eagerly per layout so data typos (one glyph on two
// keys) throw during module load — the unit suite catches them, users never do.

interface Geometry {
    readonly board: Board
    readonly capByBase: Map<string, KeyCap>
    // Direct glyphs only: which physical key (base glyph) produces this char.
    // Dead-key composed chars are deliberately absent (ledger upgrade path 1).
    readonly charToKey: Map<string, string>
    // Direct and dead-composed chars → keystroke sequence.
    readonly charToSteps: Map<string, Step[]>
}

const LAYER_MODS: Record<Layer, Pick<Step, "shift" | "altgr">> = {
    base: {},
    shift: { shift: true },
    altgr: { altgr: true },
    shiftAltgr: { shift: true, altgr: true },
}

function buildGeometry(id: string, spec: LayoutSpec): Geometry {
    const board = buildBoard(spec)
    const capByBase = new Map<string, KeyCap>()
    const charToKey = new Map<string, string>()
    const charToSteps = new Map<string, Step[]>()

    for (const row of board.rows) {
        for (const cap of row) {
            if (!capByBase.has(cap.base)) capByBase.set(cap.base, cap)
            for (const layer of LAYERS) {
                const glyph = cap[layer]
                if (glyph === undefined) continue
                const existing = charToKey.get(glyph)
                if (existing !== undefined && existing !== cap.base) {
                    throw new Error(`layout ${id}: glyph "${glyph}" on both "${existing}" and "${cap.base}"`)
                }
                if (existing === undefined) {
                    charToKey.set(glyph, cap.base)
                    charToSteps.set(glyph, [{ key: cap.base, ...LAYER_MODS[layer] }])
                }
            }
        }
    }

    // Dead-key composition: every composable char gets a two-step sequence
    // (dead press, then base). Direct keys win — ü on qwertz-de is its own key,
    // never ¨+u — and the fold map stays direct-only (upgrade path 1).
    for (const row of board.rows) {
        for (const cap of row) {
            for (const layer of cap.dead ?? []) {
                const table = COMPOSE[cap[layer]!]
                if (!table) continue
                const deadStep: Step = { key: cap.base, ...LAYER_MODS[layer], dead: true }
                for (const [baseChar, composed] of Object.entries(table)) {
                    if (charToSteps.has(composed)) continue
                    const baseSteps = charToSteps.get(baseChar)
                    if (baseSteps) charToSteps.set(composed, [deadStep, ...baseSteps])
                }
            }
        }
    }

    return { board, capByBase, charToKey, charToSteps }
}

const GEOMETRY: Record<string, Geometry> = Object.fromEntries(
    Object.entries(SPECS).map(([id, spec]) => [id, buildGeometry(id, spec)]),
)

function geometryFor(layout: string): Geometry {
    return GEOMETRY[layout] ?? GEOMETRY[DEFAULT_LAYOUT]!
}

// ---------------------------------------------------------------------------
// The interface.

export function boardFor(layout: string): Board {
    return geometryFor(layout).board
}

// Base-glyph row strings, for consumers that only need where keys sit (the
// pre-geometry rowsFor shape; layered rendering should use boardFor).
export function rowsFor(layout: string): readonly string[] {
    return geometryFor(layout).board.rows.map((row) => row.map((cap) => cap.base).join(""))
}

// Which physical key (named by its base glyph) produced this char: letters
// fold to their key, shifted/AltGr glyphs to theirs, space passes through.
// Dead-key composed chars and anything off-board return null so callers skip
// them — the single source of truth for "which cell does this char belong to".
export function keyFor(char: string, layout: string): string | null {
    if (char === " ") return " "
    const { charToKey } = geometryFor(layout)
    const direct = charToKey.get(char)
    if (direct !== undefined) return direct
    // Capitals fold to their letter's key even when the cap's shift glyph was
    // claimed elsewhere (matches the pre-geometry A-Z fold).
    const lower = char.toLowerCase()
    return lower !== char ? charToKey.get(lower) ?? null : null
}

// The glyph a key shows on a given layer. Keys off the board (space) echo
// themselves on base/shift; absent AltGr layers render as "" (no glyph).
export function glyphAt(key: string, layer: Layer, layout: string): string {
    const cap = geometryFor(layout).capByBase.get(key)
    if (!cap) return layer === "base" || layer === "shift" ? key : ""
    return cap[layer] ?? (layer === "base" || layer === "shift" ? cap.base : "")
}

// How to type a char on this layout: [] when it can't be typed, one step for
// direct keys (with shift/altgr modifiers), two steps for dead-key chars.
// Uppercase without its own cap = the lowercase sequence with shift on the
// final press (Ê = dead ^, then Shift+E).
export function sequenceFor(char: string, layout: string): Step[] {
    if (char === " ") return [{ key: " " }]
    const { charToSteps } = geometryFor(layout)
    const direct = charToSteps.get(char)
    if (direct) return direct
    const lower = char.toLowerCase()
    if (lower !== char) {
        const steps = charToSteps.get(lower)
        if (steps && steps.length > 0) {
            const last = steps[steps.length - 1]!
            return [...steps.slice(0, -1), { ...last, shift: true }]
        }
    }
    return []
}

// The storage dimension for per-key/transition/train aggregates (ledger
// decision 6): remaps retrain fingers and key their own pool; national
// layouts re-describe existing hardware and share the legacy qwerty pool.
export function statsPoolFor(layout: string): string {
    const spec = SPECS[layout] ?? SPECS[DEFAULT_LAYOUT]!
    return spec.remap ? layout : DEFAULT_LAYOUT
}

// Every pool the catalog can produce ("qwerty" + one per remap) — lets the
// sign-in import enumerate the guest mirrors without guessing storage keys.
export const STATS_POOLS: string[] = [...new Set(LAYOUT_IDS.map(statsPoolFor))]

// ---------------------------------------------------------------------------
// Setting resolution (ledger decision 4). The stored setting is AUTO_LAYOUT or
// an explicit layout id; resolution is pure so the auto chain is unit-testable:
// explicit pin → detection evidence → the language's conventional layout →
// qwerty. Language defaults name wave-2/3 ids before their data lands — the
// existence guard falls back to qwerty until each layout ships, so defaults
// activate automatically as the catalog grows.
export const AUTO_LAYOUT = "auto"

export function defaultLayoutFor(language: string, locale = ""): string {
    const lc = locale.toLowerCase()
    const pick = (id: string) => (SPECS[id] ? id : DEFAULT_LAYOUT)
    switch (language) {
        case "german": return pick(lc.startsWith("de-ch") ? "qwertz-ch" : "qwertz-de")
        case "french": return pick(lc.startsWith("fr-be") ? "azerty-be" : lc.startsWith("fr-ca") ? "cf" : "azerty-fr")
        // Latin America only when the locale names a non-Spain region (es-419,
        // es-MX…); bare "es" and es-ES take the Spain layout.
        case "spanish": return pick(/^es-(?!es)/.test(lc) ? "qwerty-latam" : "qwerty-es")
        case "italian": return pick("qwerty-it")
        case "portuguese": return pick(lc.startsWith("pt-br") ? "qwerty-abnt2" : "qwerty-pt")
        case "dutch": return pick("qwerty-us-intl")
        case "polish": return pick("qwerty-pl")
        default: return pick(lc.startsWith("en-gb") ? "qwerty-uk" : DEFAULT_LAYOUT)
    }
}

export function resolveLayout(stored: string, language: string, detected: string | null, locale = ""): string {
    if (stored !== AUTO_LAYOUT && SPECS[stored]) return stored
    if (detected && SPECS[detected]) return detected
    return defaultLayoutFor(language, locale)
}

// ---------------------------------------------------------------------------
// Picker metadata, ordered as offered in the nav menu: the default first, then
// by adoption (the languageMeta.ts pattern — nav and any chip name layouts
// identically). Narrower than LAYOUT_IDS: a layout joins the picker only once
// the boards can render it. `kind` groups the menu: national hardware layouts
// vs. remaps that retrain fingers.
export interface LayoutMeta { value: string, label: string, kind: "national" | "remap" }

export const PICKER_LAYOUTS: LayoutMeta[] = [
    { value: "qwerty", label: "QWERTY", kind: "national" },
    { value: "qwertz-de", label: "QWERTZ (DE)", kind: "national" },
    { value: "azerty-fr", label: "AZERTY (FR)", kind: "national" },
    { value: "qwerty-uk", label: "QWERTY (UK)", kind: "national" },
    { value: "qwerty-us-intl", label: "US International", kind: "national" },
    { value: "qwerty-es", label: "Spanish (ES)", kind: "national" },
    { value: "qwerty-latam", label: "Spanish (Latam)", kind: "national" },
    { value: "qwerty-it", label: "QWERTY (IT)", kind: "national" },
    { value: "qwerty-pt", label: "QWERTY (PT)", kind: "national" },
    { value: "qwerty-abnt2", label: "ABNT2 (BR)", kind: "national" },
    { value: "qwerty-pl", label: "Polish", kind: "national" },
    { value: "colemak", label: "Colemak", kind: "remap" },
    { value: "colemak-dh", label: "Colemak-DH", kind: "remap" },
    { value: "dvorak", label: "Dvorak", kind: "remap" },
    { value: "workman", label: "Workman", kind: "remap" },
]

export const layoutMeta = (value: string): LayoutMeta =>
    PICKER_LAYOUTS.find((layout) => layout.value === value) ?? PICKER_LAYOUTS[0]!

export const LAYOUTS: string[] = PICKER_LAYOUTS.map((layout) => layout.value)

// ---------------------------------------------------------------------------
// The train ladder's home-row-out order as physical positions ([row, column]
// into the board), one group per stage. Chosen so qwerty reproduces the
// hand-authored KEY_STAGES it replaced (levels.ts); every layout gets the same
// pedagogy — resting fingers first, then inner columns, outward, bottom row
// last. Positions are finger positions: on ISO boards the bottom row shifts
// one column right past the extra key, so [BOTTOM, 2] is the same physical
// spot on ANSI and ISO hardware.
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

// Ladder keys are a-z only; national accent letters ride the L45+ mastery
// stretch via levels.withLanguageAccents, never the intro stages.
const isLetter = (ch: string) => ch >= "a" && ch <= "z"

function letterAt(board: Board, row: number, col: number): string {
    const offset = board.shape === "iso" && row === BOTTOM ? 1 : 0
    return board.rows[row]?.[col + offset]?.base ?? ""
}

// Cumulative key stages for the train ladder (11 per layout, the shape
// KEY_STAGES had). Positions holding non-letters in a layout are skipped
// (qwerty drops ";" from the resting fingers, dvorak its top-row punctuation),
// and the final stage sweeps the remaining letter positions so every layout
// introduces all 26 letters.
//
// Word generation needs a vowel from stage 1 (real words and pronounceable
// pseudo-words are impossible without one), and some national home rows have
// none — AZERTY's is qsdfghjklm. Stage 1 then borrows the nearest vowel in
// position order (AZERTY: e), and the cumulative builder skips it when its
// own group arrives.
const STAGE_VOWELS = "aeiou"

export function keyStagesFor(layout: string): string[] {
    const board = boardFor(layout)
    const stages: string[] = []
    let keys = ""
    for (const group of STAGE_POSITIONS) {
        for (const [row, col] of group) {
            const ch = letterAt(board, row, col)
            if (isLetter(ch) && !keys.includes(ch)) keys += ch
        }
        if (stages.length === 0 && ![...keys].some((ch) => STAGE_VOWELS.includes(ch))) {
            outer: for (const laterGroup of STAGE_POSITIONS) {
                for (const [row, col] of laterGroup) {
                    const ch = letterAt(board, row, col)
                    if (isLetter(ch) && STAGE_VOWELS.includes(ch)) {
                        keys += ch
                        break outer
                    }
                }
            }
        }
        stages.push(keys)
    }
    const have = new Set(keys)
    const rest = board.rows
        .slice(1)
        .flatMap((row) => row.map((cap) => cap.base))
        .filter((ch) => isLetter(ch) && !have.has(ch))
    stages.push(keys + rest.join(""))
    return stages
}
