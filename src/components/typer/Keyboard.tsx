import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TestModes } from "./types";
import { getActiveKey, subscribeActiveKey } from "./keySignal";
import { accentsFor, ensureLanguageLoaded, isDrillDigit, isDrillMark } from "./utils";
import { KeyHeatmap, KeyHeatmapLegend } from "~/components/heatmap/KeyHeatmap";
import { KeyboardLayerSwitch } from "~/components/heatmap/KeyboardLayerSwitch";
import { HEATMAP_CONFIG, type KeyAttempt } from "~/lib/heatmap";
import { boardFor, composedFor, sequenceFor, keyFor } from "~/lib/keyboardLayout";
import { useLayout } from "~/hooks/useLayout";
import { useLanguage } from "~/hooks/useLanguage";
import { isDrillableKey, isPracticeLetter } from "~/lib/drillKeys";
import { effectivePracticeKeyboardLayer } from "~/lib/practiceKeyboard";

const isDrillable = isDrillableKey
// The train/guide board is display-only: no tallies, ever.
const EMPTY_ATTEMPTS = new Map<string, { attempts: number, correct: number }>()

interface KeyboardProps {
    mode: TestModes,
    selectedKeys?: string[],
    setSelectedKeys?: (keys: string[]) => void,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    evidenceAttempts?: ReadonlyMap<string, KeyAttempt> | Record<string, KeyAttempt>,
    // Per-key speed bars for the Practice heatmap, normalized against the user's
    // own pace (see keySpeedBars). Lifetime data threaded from the page.
    speedBars?: ReadonlyMap<string, { fraction: number, meanMs: number, wpm: number, count: number }>,
    highlightKeys?: string[],
    // Practice's sticky on-screen layer choice. Physical holds are applied here.
    shiftToggle?: boolean,
    // Practice: the AltGr layer equivalent (sticky toggle OR held AltGr). Only
    // wired by pages when the active layout has AltGr glyphs.
    altgrToggle?: boolean,
    onToggleShift?: () => void,
    onToggleAltgr?: () => void,
    hasAltGr?: boolean,
    // Practice text add-ons. Clicking a disabled family can enable it without a
    // trip through the gear menu.
    punctuation?: boolean,
    capitals?: boolean,
    numbers?: boolean,
    setPunctuation?: (value: boolean) => void,
    setCapitals?: (value: boolean) => void,
    setNumbers?: (value: boolean) => void,
}

// Practice board legend: one non-wrapping row (scrolls horizontally on narrow
// screens rather than breaking to two lines). Reads left to right: drill
// membership, then the two overlays the keys carry - accuracy colour and the
// speed bar - then the no-data state.
function PracticeKeyboardLegend() {
    return (
        <div className="typecafe-keyboard-legend mt-2 flex flex-nowrap items-center gap-x-3 overflow-x-auto whitespace-nowrap text-[0.65rem] text-base-content/55 [scrollbar-width:none] sm:justify-center sm:text-xs">
            <span className="inline-flex shrink-0 items-center gap-1.5">
                <span className="inline-flex h-3 w-3 rounded-full border-2 border-base-100 bg-primary outline outline-1 outline-primary" aria-hidden="true" />
                outlined = focus
            </span>
            <KeyHeatmapLegend className="!flex-nowrap gap-x-3" />
        </div>
    )
}

export const Keyboard = (props: KeyboardProps) => {
    const {
        mode, selectedKeys, setSelectedKeys, charAttemptsRef, evidenceAttempts, speedBars, highlightKeys,
        shiftToggle = false, altgrToggle = false,
        onToggleShift, onToggleAltgr, hasAltGr = false,
        punctuation = false, capitals = false, numbers = false,
        setPunctuation, setCapitals, setNumbers,
    } = props
    const [layout] = useLayout()
    const board = useMemo(() => boardFor(layout), [layout])
    const [language] = useLanguage()

    // The language's accent chars (derived from its word list once it loads;
    // [] for English and while loading) - the pool practice can drill beyond
    // a-z/digits/marks. Split by how the active layout types them: direct
    // glyphs (ü on qwertz-de, ą on Polish AltGr) lock/unlock their own cell;
    // dead-composed chars (ê on azerty-fr) ride their dead key - one click
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
    // and the heatmap's accuracy shading refreshes only when typing pauses -
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

    // Held modifiers temporarily own the visible layer. Practice restores its
    // sticky on-screen choice on release; display-only boards restore Base.
    const [heldShift, setHeldShift] = useState(false)
    const [heldAltgr, setHeldAltgr] = useState(false)
    useEffect(() => {
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
    // paints the level's keys (bg-secondary) on mount - a dead-composed level
    // char paints its dead key's cell - then moves the primary marker per
    // keystroke and restores the highlight on leave. The expected char resolves
    // through sequenceFor (ledger decision 7): one step rings its cap (with a
    // ⇧/AG modifier badge when the step needs one), a dead-key char rings both
    // caps with 1→2 step badges. Cells are addressed by data-kb-cell (stable
    // per physical key), so the marker survives layer peeks - which re-render
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

    const stickyLayer = shiftToggle ? "shift" : altgrToggle ? "altgr" : "base"
    const visibleLayer = mode === TestModes.practice
        ? effectivePracticeKeyboardLayer(stickyLayer, heldShift, heldAltgr)
        : effectivePracticeKeyboardLayer("base", heldShift, heldAltgr)
    const shiftLayer = visibleLayer === "shift" || visibleLayer === "shiftAltgr"
    const altgrLayer = visibleLayer === "altgr" || visibleLayer === "shiftAltgr"

    // A shifted letter twin (R, Ü) - not its own drill target; it mirrors the
    // base key and rides the capitals add-on.
    const isCapitalMirror = useCallback(
        (glyph: string) => !isUnlockable(glyph) && glyph.toLowerCase() !== glyph && isPracticeLetter(glyph.toLowerCase()),
        [isUnlockable],
    )
    // Focus markers read off the active layer. A typeable drill glyph owns its
    // selection on every layer (French Shift+1, AltGr accents, marks); shifted
    // letters still mirror their lowercase base key. Dead keys unlock when any
    // character in their composed set is selected.
    const focusedKeys = new Set<string>()
    if (selectedKeys) {
        const layer = visibleLayer
        for (const row of board.rows) {
            for (const cap of row) {
                const glyph = cap[layer] ?? (layer === "shiftAltgr" ? cap.altgr : undefined)
                if (!glyph) continue
                const selected =
                    accents.byDead.has(glyph) ? accents.byDead.get(glyph)!.some((ch) => selectedKeys.includes(ch))
                    : accents.direct.has(glyph) ? selectedKeys.includes(glyph)
                    : layer === "base" ? selectedKeys.includes(glyph)
                    : layer === "shift" ? selectedKeys.includes(isUnlockable(glyph) ? glyph : cap.base)
                    : isUnlockable(glyph) && selectedKeys.includes(glyph)
                if (selected) focusedKeys.add(glyph)
            }
        }
    }
    // Base cells remain broadly clickable (the handler filters). Every
    // typeable glyph on a shifted/AltGr layer is directly unlockable; capital
    // twins are clickable too - their click flips the capitals add-on.
    const interactiveKeys = useMemo(() => {
        const layer = visibleLayer
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
    }, [board, visibleLayer, isCapitalMirror, isUnlockable])

    const handleKeyClicked = (key: string) => {
        if (!selectedKeys || !setSelectedKeys || mode !== TestModes.practice) return
        // Capital twins: one click flips the capitals add-on for the whole board
        // (the base letter keeps owning the selection).
        if (isCapitalMirror(key)) {
            setCapitals?.(!capitals)
            return
        }
        // Only drillable keys toggle; display-only filler remains inert.
        if (!isUnlockable(key)) return

        // Unlocking a mark/digit while its add-on is off turns the add-on on in
        // the same click (and keeps/gains the selection) - no gear-menu trip.
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
        // A partial selection reads as focused, so clicking converges: any
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
            setSelectedKeys(selectedKeys.filter(k => k != key))
        } else {
            setSelectedKeys([...selectedKeys, key])
        }
    }

    // Practice evidence is a page-owned frozen natural-Test projection. Train
    // has no projection and keeps its display-only empty board.
    const statsAttempts = evidenceAttempts ?? charAttemptsRef.current

    return (
        <div
            ref={boardRef}
            className={`typecafe-keyboard flex w-full flex-col items-center justify-start px-2 sm:px-4 ${mode === TestModes.practice ? "pb-3 pt-0" : "py-3 md:py-4"}`}
        >
            {mode === TestModes.practice ?
                <section
                    aria-label="Practice keyboard"
                    data-kb-layer={visibleLayer}
                    className="w-full max-w-3xl"
                >
                    <div className="mb-2 mt-1 flex justify-center">
                        <KeyboardLayerSwitch
                            shiftLayer={shiftLayer}
                            altgrLayer={altgrLayer}
                            hasAltGr={hasAltGr}
                            onSelectBase={() => {
                                if (shiftToggle) onToggleShift?.()
                                if (altgrToggle) onToggleAltgr?.()
                            }}
                            onToggleShift={() => onToggleShift?.()}
                            onToggleAltgr={() => onToggleAltgr?.()}
                        />
                    </div>

                    <KeyHeatmap
                        size="full"
                        attempts={statsAttempts}
                        speedBars={speedBars}
                        minSamples={HEATMAP_CONFIG.minSamples}
                        showPercent={false}
                        selectedKeys={focusedKeys}
                        onKeyClick={handleKeyClicked}
                        followActiveKey
                        highlightKeys={highlightKeys}
                        shiftLayer={shiftLayer}
                        altgrLayer={altgrLayer}
                        interactiveKeys={interactiveKeys}
                    />
                    <PracticeKeyboardLegend />
                </section>
                :
                // Non-practice modes (train): the same full physical board as the
                // heatmap - layered keycaps, corner glyphs, dead styling, ISO
                // shape - rendered plain (no accuracy shading or percentages).
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
