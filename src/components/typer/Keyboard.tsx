import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { getActiveKey, subscribeActiveKey } from "./keySignal";
import { useDispatch } from "react-redux";
import { accentsFor, ensureLanguageLoaded, isDrillDigit, isDrillMark } from "./utils";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";
import { boardFor, composedFor, sequenceFor, keyFor, type Layer } from "~/lib/keyboardLayout";
import { useLayout } from "~/hooks/useLayout";
import { useLanguage } from "~/hooks/useLanguage";
import { isDrillableKey, isPracticeLetter, isPracticeVowel } from "~/lib/drillKeys";

const isDrillable = isDrillableKey
// The train/guide board is display-only: no tallies, ever.
const EMPTY_ATTEMPTS = new Map<string, { attempts: number, correct: number }>()

interface KeyboardProps {
    mode: TestModes,
    selectedKeys?: string[],
    setSelectedKeys?: (keys: string[]) => void,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    baseAttemptsRef?: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    highlightKeys?: string[],
    // Practice: the combined shift-layer state (sticky settings-line toggle OR a
    // held-Shift peek) — both owned by the page so the label and board stay in sync.
    shiftToggle?: boolean,
    // Practice: the AltGr layer equivalent (sticky toggle OR held AltGr). Only
    // wired by pages when the active layout has AltGr glyphs.
    altgrToggle?: boolean,
    // Practice text add-ons. A toggled-off add-on locks its keys on the board
    // (no marks/digits/capitals in the text regardless of selection); clicking a
    // locked key flips the add-on back on, so nobody digs through the gear menu.
    punctuation?: boolean,
    capitals?: boolean,
    numbers?: boolean,
    setPunctuation?: (value: boolean) => void,
    setCapitals?: (value: boolean) => void,
    setNumbers?: (value: boolean) => void,
}

// Layer picking, shared by the lock and interactive sets so they always agree
// with the glyph KeyHeatmap renders (its shiftAltgr layer falls back to altgr).
const activeLayer = (shift: boolean, altgr: boolean): Layer =>
    altgr ? (shift ? "shiftAltgr" : "altgr") : shift ? "shift" : "base"

export const Keyboard = (props: KeyboardProps) => {
    const {
        mode, selectedKeys, setSelectedKeys, charAttemptsRef, baseAttemptsRef, highlightKeys,
        shiftToggle = false, altgrToggle = false,
        punctuation = false, capitals = false, numbers = false,
        setPunctuation, setCapitals, setNumbers,
    } = props
    const dispatch = useDispatch()
    const [layout] = useLayout()
    const board = useMemo(() => boardFor(layout), [layout])
    const [language] = useLanguage()

    // The language's accent chars (derived from its word list once it loads;
    // [] for English and while loading) — the pool practice can drill beyond
    // a-z/digits/marks. Split by how the active layout types them: direct
    // glyphs (ü on qwertz-de, ą on Polish AltGr) lock/unlock their own cell;
    // dead-composed chars (ê on azerty-fr) ride their dead key — one click
    // toggles the whole composed set.
    const [accentChars, setAccentChars] = useState<string[]>([])
    useEffect(() => {
        let alive = true
        void ensureLanguageLoaded(language).then(() => { if (alive) setAccentChars(accentsFor(language)) })
        return () => { alive = false }
    }, [language])
    const accents = useMemo(() => {
        const direct = new Set(accentChars.filter((ch) => sequenceFor(ch, layout).length === 1))
        const byDead = new Map<string, string[]>()
        for (const row of board.rows) {
            for (const cap of row) {
                for (const layer of cap.dead ?? []) {
                    const deadGlyph = cap[layer]!
                    const composed = composedFor(deadGlyph, layout).filter((ch) => accentChars.includes(ch))
                    if (composed.length > 0) byDead.set(deadGlyph, composed)
                }
            }
        }
        return { direct, byDead }
    }, [accentChars, board, layout])
    const isUnlockable = useCallback(
        (glyph: string) => isDrillable(glyph) || accents.direct.has(glyph) || accents.byDead.has(glyph),
        [accents],
    )

    // A keystroke never re-renders the board (typing-feel §1): the moving
    // current-key marker is applied imperatively below (and inside KeyHeatmap),
    // and the heatmap's accuracy shading refreshes only when typing pauses —
    // a trailing debounce that re-reads charAttemptsRef. Mid-burst the numbers
    // aren't readable anyway; a calm board while typing is the better behavior.
    const [, setShadingTick] = useState(0)
    useEffect(() => {
        if (mode !== TestModes.practice) return
        let timer: ReturnType<typeof setTimeout> | undefined
        const unsubscribe = subscribeActiveKey(() => {
            clearTimeout(timer)
            timer = setTimeout(() => setShadingTick((tick) => tick + 1), 250)
        })
        return () => {
            clearTimeout(timer)
            unsubscribe()
        }
    }, [mode])

    // Held-modifier peek for the non-practice (train/guide) board: the pages
    // don't wire toggles here, so the board itself listens — holding Shift or
    // AltGr peeks that layer, releasing (or blurring) returns to base. The
    // practice board keeps the page-owned combined toggles instead.
    const [heldShift, setHeldShift] = useState(false)
    const [heldAltgr, setHeldAltgr] = useState(false)
    useEffect(() => {
        if (mode === TestModes.practice) return
        const onDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") setHeldShift(true)
            if (e.key === "AltGraph") setHeldAltgr(true)
        }
        const onUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") setHeldShift(false)
            if (e.key === "AltGraph") setHeldAltgr(false)
        }
        const clear = () => {
            setHeldShift(false)
            setHeldAltgr(false)
        }
        window.addEventListener("keydown", onDown)
        window.addEventListener("keyup", onUp)
        window.addEventListener("blur", clear)
        return () => {
            window.removeEventListener("keydown", onDown)
            window.removeEventListener("keyup", onUp)
            window.removeEventListener("blur", clear)
        }
    }, [mode])

    // Non-practice board: light the next key by swapping classes on the cells,
    // not by re-rendering. This effect owns every color on the plain board: it
    // paints the level's keys (bg-secondary) on mount — a dead-composed level
    // char paints its dead key's cell — then moves the primary marker per
    // keystroke and restores the highlight on leave. The expected char resolves
    // through sequenceFor (ledger decision 7): one step rings its cap (with a
    // ⇧/AG modifier badge when the step needs one), a dead-key char rings both
    // caps with 1→2 step badges. Cells are addressed by data-kb-cell (stable
    // per physical key), so the marker survives layer peeks — which re-render
    // the caps and re-run this effect via the held* deps.
    const boardRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (mode === TestModes.practice) return
        const root = boardRef.current
        if (!root) return
        const HIGHLIGHT = ["bg-secondary", "text-secondary-content"]
        const MARKER = ["bg-primary", "text-primary-content"]
        const cellOf = (key: string) => root.querySelector<HTMLElement>(`[data-kb-cell="${CSS.escape(key)}"]`)
        const painted: HTMLElement[] = []
        for (const ch of highlightKeys ?? []) {
            const el = cellOf(keyFor(ch, layout) ?? ch)
            if (el && !painted.includes(el)) {
                el.classList.add(...HIGHLIGHT)
                painted.push(el)
            }
        }
        let lit: HTMLElement[] = []
        const apply = (char: string) => {
            for (const el of lit) {
                el.classList.remove(...MARKER)
                el.removeAttribute("data-kb-step")
                if (painted.includes(el)) el.classList.add(...HIGHLIGHT)
            }
            lit = []
            if (!char) return
            const steps = char === " " ? [{ key: " " }] : sequenceFor(char, layout)
            steps.forEach((step, index) => {
                const el = cellOf(step.key)
                if (!el) return
                el.classList.remove(...HIGHLIGHT)
                el.classList.add(...MARKER)
                if (steps.length > 1) el.setAttribute("data-kb-step", String(index + 1))
                else if (step.shift) el.setAttribute("data-kb-step", "\u21e7")
                else if (step.altgr) el.setAttribute("data-kb-step", "AG")
                lit.push(el)
            })
        }
        apply(getActiveKey())
        const unsubscribe = subscribeActiveKey(apply)
        return () => {
            unsubscribe()
            apply("")
            for (const el of painted) el.classList.remove(...HIGHLIGHT)
        }
    }, [mode, highlightKeys, layout, heldShift, heldAltgr])

    // Layer state: the pages own the combined toggles (sticky settings-line
    // buttons OR held-modifier peeks), passed in as shiftToggle/altgrToggle.
    const shiftLayer = shiftToggle
    const altgrLayer = altgrToggle

    // A shifted letter twin (R, Ü) — not its own drill target; it mirrors the
    // base key and rides the capitals add-on.
    const isCapitalMirror = useCallback(
        (glyph: string) => !isUnlockable(glyph) && glyph.toLowerCase() !== glyph && isPracticeLetter(glyph.toLowerCase()),
        [isUnlockable],
    )
    // A toggled-off text add-on locks its whole key family, whatever the
    // selection says — the text can't contain them, so the board shouldn't
    // claim otherwise.
    const addOnLocked = (glyph: string) =>
        (isDrillMark(glyph) && !punctuation) || (isDrillDigit(glyph) && !numbers) || (isCapitalMirror(glyph) && !capitals)

    // Lock badges read off the active layer. A typeable drill glyph owns its
    // selection on every layer (French Shift+1, AltGr accents, marks); shifted
    // letters still mirror their lowercase base key. Dead keys unlock when any
    // character in their composed set is selected.
    const lockedKeys = new Set<string>()
    if (selectedKeys) {
        const layer = activeLayer(shiftLayer, altgrLayer)
        for (const row of board.rows) {
            for (const cap of row) {
                const glyph = cap[layer] ?? (layer === "shiftAltgr" ? cap.altgr : undefined)
                if (!glyph) continue
                const unlocked =
                    accents.byDead.has(glyph) ? accents.byDead.get(glyph)!.some((ch) => selectedKeys.includes(ch))
                    : accents.direct.has(glyph) ? selectedKeys.includes(glyph)
                    : layer === "base" ? selectedKeys.includes(glyph)
                    : layer === "shift" ? selectedKeys.includes(isUnlockable(glyph) ? glyph : cap.base)
                    : isUnlockable(glyph) && selectedKeys.includes(glyph)
                if (!unlocked || addOnLocked(glyph)) lockedKeys.add(glyph)
            }
        }
    }
    // Base cells remain broadly clickable (the handler filters). Every
    // typeable glyph on a shifted/AltGr layer is directly unlockable; capital
    // twins are clickable too — their click flips the capitals add-on.
    const interactiveKeys = useMemo(() => {
        const layer = activeLayer(shiftLayer, altgrLayer)
        if (layer === "base") return undefined
        const allow = new Set<string>()
        for (const row of board.rows) {
            for (const cap of row) {
                const glyph = cap[layer] ?? (layer === "shiftAltgr" ? cap.altgr : undefined)
                if (!glyph) continue
                if (isUnlockable(glyph) || isCapitalMirror(glyph)) allow.add(glyph)
            }
        }
        return allow
    }, [board, shiftLayer, altgrLayer, isCapitalMirror, isUnlockable])

    const handleKeyClicked = (key: string) => {
        if (!selectedKeys || !setSelectedKeys || mode !== TestModes.practice) return
        // Capital twins: one click flips the capitals add-on for the whole board
        // (the base letter keeps owning the selection).
        if (isCapitalMirror(key)) {
            setCapitals?.(!capitals)
            return
        }
        // Only drillable keys toggle; display-only filler stays permanently locked.
        if (!isUnlockable(key)) return

        // Unlocking a mark/digit while its add-on is off turns the add-on on in
        // the same click (and keeps/gains the selection) — no gear-menu trip.
        if (isDrillMark(key) && !punctuation) {
            setPunctuation?.(true)
            if (!selectedKeys.includes(key)) setSelectedKeys([...selectedKeys, key])
            return
        }
        if (isDrillDigit(key) && !numbers) {
            setNumbers?.(true)
            if (!selectedKeys.includes(key)) setSelectedKeys([...selectedKeys, key])
            return
        }

        // A dead key is one toggle for its whole composed set (ê â î ô û ride ^).
        // A partial selection reads as unlocked, so clicking converges: any
        // selected → drop them all; none → add them all.
        const composed = accents.byDead.get(key)
        if (composed) {
            const anySelected = composed.some((ch) => selectedKeys.includes(ch))
            setSelectedKeys(anySelected
                ? selectedKeys.filter((k) => !composed.includes(k))
                : [...selectedKeys, ...composed.filter((ch) => !selectedKeys.includes(ch))])
            return
        }

        if (selectedKeys.includes(key)) {
            // Letters anchor word generation, so keep enough of them: at least 8,
            // including two vowels and a consonant. International letters count
            // too; numbers/punctuation remain add-on drill targets.
            if (isPracticeLetter(key)) {
                const letters = selectedKeys.filter(isPracticeLetter)
                if (letters.length <= 8) {
                    dispatch(addAlert({ message: "Must include at least 8 keys!", type: "error" }))
                    return
                }
                if (isPracticeVowel(key) && letters.filter(isPracticeVowel).length <= 2) {
                    dispatch(addAlert({ message: "Must include at least 2 vowels!", type: "error" }))
                    return
                }
                if (!isPracticeVowel(key) && letters.filter((letter) => !isPracticeVowel(letter)).length <= 1) {
                    dispatch(addAlert({ message: "Must include at least 1 consonant!", type: "error" }))
                    return
                }
            }

            setSelectedKeys(selectedKeys.filter(k => k != key))
        } else {
            setSelectedKeys([...selectedKeys, key])
        }
    }

    // Combined lifetime + live-session per-key tally that feeds the analytics
    // heatmap, kept *unfolded* (keyed by the actual char) so the base layer reads
    // r/;/1 and the shift layer reads R/:/! — each glyph its own accuracy.
    const buildStatsAttempts = () => {
        const merged = new Map<string, { attempts: number, correct: number }>()
        const addAll = (m?: Map<string, { attempts: number, correct: number }>) => {
            if (!m) return
            for (const [key, value] of m) {
                const entry = merged.get(key) ?? { attempts: 0, correct: 0 }
                entry.attempts += value.attempts
                entry.correct += value.correct
                merged.set(key, entry)
            }
        }
        addAll(baseAttemptsRef?.current)
        addAll(charAttemptsRef.current)
        return merged
    }

    return (
        <div ref={boardRef} className="typecafe-keyboard flex flex-col w-full items-center justify-start py-3 pt-2 md:py-4">
            {mode === TestModes.practice ?
                <div className="flex flex-col">
                    <KeyHeatmap
                        size="full"
                        attempts={buildStatsAttempts()}
                        lockedKeys={lockedKeys}
                        onKeyClick={handleKeyClicked}
                        followActiveKey
                        highlightKeys={highlightKeys}
                        shiftLayer={shiftLayer}
                        altgrLayer={altgrLayer}
                        interactiveKeys={interactiveKeys}
                    />
                    <p className="mt-2 text-center font-mono text-[10px] text-base-content/40">
                        click a key to lock or unlock it
                    </p>
                </div>
                :
                // Non-practice modes (train): the same full physical board as the
                // heatmap — layered keycaps, corner glyphs, dead styling, ISO
                // shape — rendered plain (no accuracy shading or percentages).
                // The imperative effect above owns the level highlight and the
                // next-key marker; holding Shift/AltGr peeks those layers.
                <KeyHeatmap
                    size="full"
                    attempts={EMPTY_ATTEMPTS}
                    showAccuracy={false}
                    shiftLayer={heldShift}
                    altgrLayer={heldAltgr}
                />
            }
        </div>
    )
}
