// Keyboard-layout detection (docs/features/keyboard-layouts.md decision 5):
// a pure signature matcher fed by two adapters — the Chromium-only
// navigator.keyboard.getLayoutMap() probe (no permission prompt; Firefox and
// Safari never ship it) and a passive keystroke listener that works
// everywhere. Verdicts only feed the `auto` resolution chain (useLayout owns
// the cache and the apply-at-mount-boundary policy); an explicit pin is never
// overridden.

// The physical keys whose unshifted output fingerprints a layout. e.code names
// physical positions, so the same table serves both adapters.
export const PROBE_CODES = [
    "KeyQ", "KeyW", "KeyY", "KeyZ", "KeyA", "KeyM",
    "Semicolon", "Quote", "BracketLeft", "Backslash", "Minus",
] as const

// Unshifted `code → key` fingerprints. Only distinctive probes are listed —
// an observation for an unlisted code neither helps nor contradicts.
// Layouts indistinguishable at the base layer (qwerty vs us-intl vs polish —
// they differ only in dead keys/AltGr, which the layout map doesn't expose;
// spanish-es vs latam under sparse passive data) tie, and matchLayout returns
// null so resolveLayout falls through to defaultLayoutFor's locale tiebreaks.
// Signatures may name layouts whose data hasn't shipped (qwertz-ch): resolve
// guards unknown ids, so they only ever *null out* a wrong verdict.
const SIGNATURES: Record<string, Record<string, string>> = {
    "qwerty": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: ";", Quote: "'", BracketLeft: "[", Backslash: "\\", Minus: "-" },
    "qwerty-us-intl": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: ";", Quote: "'", BracketLeft: "[", Backslash: "\\", Minus: "-" },
    "qwerty-pl": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: ";", Quote: "'", BracketLeft: "[", Backslash: "\\", Minus: "-" },
    "qwerty-uk": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: ";", Quote: "'", BracketLeft: "[", Backslash: "#", Minus: "-" },
    "qwertz-de": { KeyQ: "q", KeyW: "w", KeyY: "z", KeyZ: "y", KeyA: "a", KeyM: "m", Semicolon: "ö", Quote: "ä", BracketLeft: "ü", Backslash: "#", Minus: "ß" },
    "qwertz-ch": { KeyQ: "q", KeyW: "w", KeyY: "z", KeyZ: "y", KeyA: "a", KeyM: "m", Semicolon: "ö", Quote: "ä", BracketLeft: "ü", Backslash: "$", Minus: "'" },
    "azerty-fr": { KeyQ: "a", KeyW: "z", KeyY: "y", KeyZ: "w", KeyA: "q", KeyM: ",", Semicolon: "m", Quote: "ù", Minus: ")" },
    "cf": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: ";", Quote: "è", BracketLeft: "^", Minus: "-" },
    "qwerty-es": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "ñ", Quote: "´", BracketLeft: "`", Backslash: "ç", Minus: "'" },
    "qwerty-latam": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "ñ", Quote: "{", BracketLeft: "´", Backslash: "}", Minus: "'" },
    "qwerty-it": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "ò", Quote: "à", BracketLeft: "è", Backslash: "ù", Minus: "'" },
    "qwerty-pt": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "ç", Quote: "º", BracketLeft: "+", Backslash: "~", Minus: "'" },
    "qwerty-abnt2": { KeyQ: "q", KeyW: "w", KeyY: "y", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "ç", Quote: "~", BracketLeft: "´", Backslash: "]", Minus: "-" },
    "dvorak": { KeyQ: "'", KeyW: ",", KeyY: "f", KeyZ: ";", KeyA: "a", KeyM: "m", Semicolon: "s", Quote: "-", BracketLeft: "/", Minus: "[" },
    "colemak": { KeyQ: "q", KeyW: "w", KeyY: "j", KeyZ: "z", KeyA: "a", KeyM: "m", Semicolon: "o", Quote: "'", BracketLeft: "[", Minus: "-" },
    "colemak-dh": { KeyQ: "q", KeyW: "w", KeyY: "j", KeyZ: "z", KeyA: "a", KeyM: "h", Semicolon: "o", Quote: "'", BracketLeft: "[", Minus: "-" },
    "workman": { KeyQ: "q", KeyW: "d", KeyY: "j", KeyZ: "z", KeyA: "a", KeyM: "l", Semicolon: "i", Quote: "'", BracketLeft: "[", Minus: "-" },
}

// The seam both adapters feed. A verdict needs one layout that (a) never
// contradicts an overlapping observation and (b) matches at least two of
// them — and it must be the ONLY such layout. Ties (identical base layers,
// sparse passive data) return null: ambiguity is the language default's job,
// never a guess here.
export function matchLayout(observations: Record<string, string>): string | null {
    let verdict: string | null = null
    let viable = 0
    for (const [layout, signature] of Object.entries(SIGNATURES)) {
        let matches = 0
        let contradicted = false
        for (const [code, key] of Object.entries(observations)) {
            const expected = signature[code]
            if (expected === undefined) continue
            if (expected === key) matches += 1
            else {
                contradicted = true
                break
            }
        }
        if (contradicted || matches < 2) continue
        viable += 1
        verdict = layout
    }
    return viable === 1 ? verdict : null
}

// Chromium probe: the whole layout map in one call (secure context, top-level
// frame; no user-facing prompt). Null anywhere it's unsupported or blocked.
interface KeyboardApi { getLayoutMap?: () => Promise<Map<string, string>> }

export async function probeKeyboardApi(): Promise<Record<string, string> | null> {
    try {
        // navigator.keyboard is Chromium-only and absent from lib.dom — a
        // feature-detected cast, not trust in the shape.
        const keyboard = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard
        const map = await keyboard?.getLayoutMap?.()
        if (!map) return null
        const observations: Record<string, string> = {}
        for (const code of PROBE_CODES) {
            const key = map.get(code)
            if (key) observations[code] = key
        }
        return observations
    } catch {
        return null
    }
}

export type DetectionSource = "api" | "passive"

// Start both adapters once per session (useLayout calls this on mount; the
// module flag makes re-mounts free). The callback receives every fresh
// verdict; the caller owns caching and when to apply it — the ledger's
// mount/test-boundary rule lives there, not here.
let started = false

export function startLayoutDetection(onVerdict: (layout: string, source: DetectionSource) => void): void {
    if (started || typeof window === "undefined") return
    started = true

    void probeKeyboardApi().then((observations) => {
        if (!observations) return
        const verdict = matchLayout(observations)
        if (verdict) onVerdict(verdict, "api")
    })

    // Passive fallback (all browsers, zero permissions): real typing already
    // carries code→key evidence. Modified strokes are skipped — shift/AltGr
    // change e.key and would fake contradictions; dead keys report multi-char
    // e.key ("Dead") and fall to the length guard.
    const observations: Record<string, string> = {}
    let lastVerdict: string | null = null
    window.addEventListener(
        "keydown",
        (event) => {
            if (event.key.length !== 1) return
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.getModifierState("AltGraph")) return
            if (!(PROBE_CODES as readonly string[]).includes(event.code)) return
            if (observations[event.code] === event.key) return
            observations[event.code] = event.key
            const verdict = matchLayout(observations)
            if (verdict && verdict !== lastVerdict) {
                lastVerdict = verdict
                onVerdict(verdict, "passive")
            }
        },
        { capture: true, passive: true },
    )
}
