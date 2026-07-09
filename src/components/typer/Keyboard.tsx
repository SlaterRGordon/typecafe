import { useEffect, useMemo, useRef, useState } from "react";
import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { getActiveKey, subscribeActiveKey } from "./keySignal";
import { useDispatch } from "react-redux";
import { isDrillDigit, isDrillMark } from "./utils";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";
import { boardFor, glyphAt, sequenceFor, type Board } from "~/lib/keyboardLayout";
import { useLayout } from "~/hooks/useLayout";

const VOWELS = "aeiou"
const CONSONANTS = "bcdfghjklmnpqrstvwxyz"
const ALPHABET = "abcdefghijklmnopqrstuvwxyz"
const isDrillable = (key: string) => ALPHABET.includes(key) || isDrillDigit(key) || isDrillMark(key)

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
}

// The next-key teaching aid renders the caps a typist aims for: letter keys
// (including national accent letters — ü ö ä have positions now) plus the
// layout's dead keys, since two-step guidance must be able to ring them.
// Number-row-only layouts' symbol keys stay off this minimal board.
// ponytail: qwerty reproduces the exact pre-layout 10/9/7 letter rows.
function guideRows(board: Board) {
    return board.rows
        .map((row) => row.filter((cap) => /\p{L}/u.test(cap.base) || (cap.dead?.length ?? 0) > 0))
        .filter((row) => row.length > 0)
}

export const Keyboard = (props: KeyboardProps) => {
    const { mode, selectedKeys, setSelectedKeys, charAttemptsRef, baseAttemptsRef, highlightKeys, shiftToggle = false, altgrToggle = false } = props
    const dispatch = useDispatch()
    const [layout] = useLayout()
    const board = useMemo(() => boardFor(layout), [layout])

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

    // Non-practice board: light the next key by swapping classes on the cells,
    // not by re-rendering. Render applies the static highlight (level keys);
    // this swap owns the primary marker and restores the highlight on leave.
    // The expected char resolves through sequenceFor (ledger decision 7): one
    // step rings its cap (with a ⇧/AG modifier badge when the step needs one),
    // a dead-key char rings both caps with 1→2 step badges.
    const boardRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (mode === TestModes.practice) return
        const root = boardRef.current
        if (!root) return
        let lit: HTMLElement[] = []
        const apply = (char: string) => {
            for (const el of lit) {
                el.classList.remove("bg-primary", "text-primary-content")
                el.removeAttribute("data-kb-step")
                const prevKey = el.dataset.kbKey
                if (prevKey && highlightKeys?.includes(prevKey)) el.classList.add("bg-secondary", "text-secondary-content")
            }
            lit = []
            if (!char) return
            const steps = char === " " ? [{ key: " " }] : sequenceFor(char, layout)
            steps.forEach((step, index) => {
                const el = root.querySelector<HTMLElement>(`[data-kb-key="${CSS.escape(step.key)}"]`)
                if (!el) return
                el.classList.remove("bg-secondary", "text-secondary-content")
                el.classList.add("bg-primary", "text-primary-content")
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
        }
    }, [mode, highlightKeys, layout])

    // Layer state: the pages own the combined toggles (sticky settings-line
    // buttons OR held-modifier peeks), passed in as shiftToggle/altgrToggle.
    const shiftLayer = shiftToggle
    const altgrLayer = altgrToggle

    // Lock badges read off the active layer, so every not-enabled cell shows locked.
    // Base layer: any physical key not in the drill set (display-only filler and
    // national accent keys always read locked). Shift layer: a shifted mark (! ? :)
    // is locked when it isn't its own selected drill key; every other shifted glyph
    // follows its base key — so a capital is locked exactly when its lowercase
    // letter is. The AltGr layers are entirely display-only (nothing generates
    // AltGr chords in practice), so every glyph there reads locked.
    const lockedKeys = new Set<string>()
    if (selectedKeys) {
        for (const row of board.rows) {
            for (const cap of row) {
                if (altgrLayer) {
                    const glyph = glyphAt(cap.base, shiftLayer ? "shiftAltgr" : "altgr", layout)
                    if (glyph) lockedKeys.add(glyph)
                    continue
                }
                const glyph = shiftLayer ? cap.shift : cap.base
                const enabledKey = shiftLayer && !isDrillMark(glyph) ? cap.base : glyph
                if (!selectedKeys.includes(enabledKey)) lockedKeys.add(glyph)
            }
        }
    }
    // The drillable marks living on the shift layer (! ? :) are the only
    // shift-layer cells that lock/unlock; AltGr layers expose nothing.
    const interactiveKeys = useMemo(() => {
        if (altgrLayer) return new Set<string>()
        if (!shiftLayer) return undefined
        return new Set(board.rows.flat().map((cap) => cap.shift).filter(isDrillMark))
    }, [board, shiftLayer, altgrLayer])

    const handleKeyClicked = (key: string) => {
        if (!selectedKeys || !setSelectedKeys || mode !== TestModes.practice) return
        // Only drillable keys toggle; display-only filler stays permanently locked.
        if (!isDrillable(key)) return

        if (selectedKeys.includes(key)) {
            // Letters anchor word generation, so keep enough of them: at least 6,
            // including a vowel and a consonant. Numbers/punctuation are add-on
            // drill targets that don't count toward the floor and remove freely.
            if (ALPHABET.includes(key)) {
                const letters = selectedKeys.filter(k => ALPHABET.includes(k))
                if (letters.length <= 8) {
                    dispatch(addAlert({ message: "Must include at least 6 keys!", type: "error" }))
                    return
                }
                if (VOWELS.includes(key) && letters.filter(k => VOWELS.includes(k)).length <= 2) {
                    dispatch(addAlert({ message: "Must include at least 1 vowel!", type: "error" }))
                    return
                }
                if (CONSONANTS.includes(key) && letters.filter(k => CONSONANTS.includes(k)).length <= 1) {
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
                // Non-practice modes: a read-only keyboard that just highlights the
                // next key (and any diagnosed keys) as a typing aid. Step badges
                // render from data-kb-step via the after:content class below.
                <>
                    {guideRows(board).map((row, rowIndex) => (
                        <div key={rowIndex} className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                            {row.map((cap) => (
                                <kbd
                                    key={cap.base}
                                    data-kb-key={cap.base}
                                    data-kb-dead={cap.dead?.length ? "" : undefined}
                                    className={`kbd kbd-md sm:kbd-lg relative after:absolute after:-right-1 after:-top-1.5 after:text-[9px] after:font-bold after:text-primary after:content-[attr(data-kb-step)] ${cap.dead?.length ? "border-2 border-dashed border-base-content/40" : ""} ${highlightKeys?.includes(cap.base) ? 'bg-secondary text-secondary-content' : ''}`}
                                >
                                    {cap.base}
                                </kbd>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-0.5 my-0.5 w-full">
                        <kbd data-kb-key=" " className="kbd kbd-md sm:kbd-lg !min-w-[14rem] sm:!min-w-[17.5rem]">&nbsp;</kbd>
                    </div>
                </>
            }
        </div>
    )
}
