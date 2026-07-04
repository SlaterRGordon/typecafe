import { useEffect, useRef, useState } from "react";
import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { getActiveKey, subscribeActiveKey } from "./keySignal";
import { useDispatch } from "react-redux";
import { HEATMAP_ROWS, shiftedGlyph } from "~/lib/heatmap";
import { isDrillDigit, isDrillMark } from "./utils";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";

const VOWELS = "aeiou"
const CONSONANTS = "bcdfghjklmnpqrstvwxyz"
const ALPHABET = "abcdefghijklmnopqrstuvwxyz"
const isDrillable = (key: string) => ALPHABET.includes(key) || isDrillDigit(key) || isDrillMark(key)
// Every physical key on the board. Anything not in the drill set is shown locked —
// including display-only filler ([ ] \ = / ') that text generation never uses.
const ALL_KEYS = HEATMAP_ROWS.join("").split("")
// The drillable marks that live on the shift layer (! ? :). These are the only
// shift-layer cells that lock/unlock — capitals and the other shifted glyphs are
// display-only (Decision 4).
const SHIFT_DRILL_MARKS = ALL_KEYS.map(shiftedGlyph).filter(isDrillMark)

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
}

const letters = "qwertyuiopasdfghjklzxcvbnm/"

export const Keyboard = (props: KeyboardProps) => {
    const { mode, selectedKeys, setSelectedKeys, charAttemptsRef, baseAttemptsRef, highlightKeys, shiftToggle = false } = props
    const dispatch = useDispatch()

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

    // Non-practice board: light the next key by swapping classes on the cell,
    // not by re-rendering. Render applies the static highlight (level keys);
    // this swap owns the primary marker and restores the highlight on leave.
    const boardRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (mode === TestModes.practice) return
        const root = boardRef.current
        if (!root) return
        let lit: HTMLElement | null = null
        const apply = (key: string) => {
            if (lit) {
                lit.classList.remove("bg-primary", "text-primary-content")
                const prevKey = lit.dataset.kbKey
                if (prevKey && highlightKeys?.includes(prevKey)) lit.classList.add("bg-secondary", "text-secondary-content")
            }
            lit = key ? root.querySelector<HTMLElement>(`[data-kb-key="${CSS.escape(key)}"]`) : null
            if (lit) {
                lit.classList.remove("bg-secondary", "text-secondary-content")
                lit.classList.add("bg-primary", "text-primary-content")
            }
        }
        apply(getActiveKey())
        const unsubscribe = subscribeActiveKey(apply)
        return () => {
            unsubscribe()
            apply("")
        }
    }, [mode, highlightKeys])

    // Shift layer flips every cell to its shifted twin (R, ?, !, :) to read those
    // accuracies separately. The page owns the combined state (sticky toggle OR a
    // held-Shift peek), passed in as `shiftToggle`.
    const shiftLayer = shiftToggle

    // Lock badges read off the active layer, so every not-enabled cell shows locked.
    // Base layer: any physical key not in the drill set (display-only filler always
    // reads locked). Shift layer: a shifted mark (! ? :) is locked when it isn't its
    // own selected drill key; every other shifted glyph follows its base key — so a
    // capital is locked exactly when its lowercase letter is, and display-only
    // shifted glyphs always read locked. Only the marks are clickable.
    const lockedKeys = new Set<string>()
    if (selectedKeys) {
        for (const key of ALL_KEYS) {
            const glyph = shiftLayer ? shiftedGlyph(key) : key
            const enabledKey = shiftLayer && !isDrillMark(glyph) ? key : glyph
            if (!selectedKeys.includes(enabledKey)) lockedKeys.add(glyph)
        }
    }
    const interactiveKeys = shiftLayer ? new Set(SHIFT_DRILL_MARKS) : undefined

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
                        interactiveKeys={interactiveKeys}
                    />
                    <p className="mt-2 text-center font-mono text-[10px] text-base-content/40">
                        click a key to lock or unlock it
                    </p>
                </div>
                :
                // Non-practice modes: a read-only keyboard that just highlights the
                // next key (and any diagnosed keys) as a typing aid.
                <>
                    {[letters.slice(0, 10), letters.slice(10, 19), letters.slice(19, 26)].map((row, rowIndex) => (
                        <div key={rowIndex} className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                            {row.split("").map((key: string, index: number) => (
                                <kbd
                                    key={index}
                                    data-kb-key={key}
                                    className={`kbd kbd-md sm:kbd-lg ${highlightKeys?.includes(key) ? 'bg-secondary text-secondary-content' : ''}`}
                                >
                                    {key}
                                </kbd>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        <kbd data-kb-key=" " className="kbd kbd-md sm:kbd-lg !min-w-[14rem] sm:!min-w-[17.5rem]">&nbsp;</kbd>
                    </div>
                </>
            }
        </div>
    )
}

