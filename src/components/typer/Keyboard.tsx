import { useEffect, useState } from "react";
import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { useDispatch } from "react-redux";
import { worstKeysFromAttempts } from "~/lib/stats";
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
    currentKey: string,
    selectedKeys?: string[],
    setSelectedKeys?: (keys: string[]) => void,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    baseAttemptsRef?: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    attemptVersion?: number,
    highlightKeys?: string[],
}

const letters = "qwertyuiopasdfghjklzxcvbnm/"

export const Keyboard = (props: KeyboardProps) => {
    const { mode, currentKey, selectedKeys, setSelectedKeys, charAttemptsRef, baseAttemptsRef, highlightKeys } = props
    const dispatch = useDispatch()

    // Shift layer flips every cell to its shifted twin (R, ?, !, :) to read those
    // accuracies separately. Two ways in: a sticky button toggle, or holding Shift
    // to peek (release returns to base). Hold-to-peek rather than a key toggle so
    // typing a shifted glyph mid-test can't leave the layer stuck flipped.
    const [shiftToggle, setShiftToggle] = useState(false)
    const [shiftHeld, setShiftHeld] = useState(false)
    const shiftLayer = shiftToggle || shiftHeld

    useEffect(() => {
        if (mode !== TestModes.practice) return
        const onDown = (e: KeyboardEvent) => {
            if (e.key !== "Shift" || e.repeat) return
            setShiftHeld(true)
        }
        const onUp = (e: KeyboardEvent) => { if (e.key === "Shift") setShiftHeld(false) }
        const clear = () => setShiftHeld(false)
        window.addEventListener("keydown", onDown)
        window.addEventListener("keyup", onUp)
        window.addEventListener("blur", clear)
        return () => {
            window.removeEventListener("keydown", onDown)
            window.removeEventListener("keyup", onUp)
            window.removeEventListener("blur", clear)
        }
    }, [mode])

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
                if (letters.length <= 6) {
                    dispatch(addAlert({ message: "Must include at least 6 keys!", type: "error" }))
                    return
                }
                if (VOWELS.includes(key) && letters.filter(k => VOWELS.includes(k)).length <= 1) {
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

    // Build a practice set from the user's eight least-accurate keys (folded
    // lifetime + session attempts) across letters, numbers and punctuation. The
    // worst letters anchor word generation — padded with home-row keys and
    // balanced so generation always has two vowels and a consonant; any weak
    // numbers/punctuation ride along as extra drill targets sprinkled into the text.
    const handleSmartDrill = () => {
        if (!setSelectedKeys || mode !== TestModes.practice) return

        const drillable = new Map<string, { attempts: number, correct: number }>()
        for (const [key, value] of buildStatsAttempts()) {
            if (isDrillable(key)) drillable.set(key, value)
        }

        // minAttempts 3 matches the /progress "weakest keys" list, so smart drill
        // targets exactly the keys shown as weak there (a 0%-accuracy key with only
        // a few attempts was being skipped at the old threshold of 5).
        const worst = worstKeysFromAttempts(drillable, 8, 3)
        if (worst.length === 0) {
            dispatch(addAlert({ message: "Not enough typing data yet — practice a little first!", type: "warning" }))
            return
        }
        const worstKeys = worst.map((entry) => entry.key)

        // Letters anchor word-gen: keep the weak letters, pad to eight.
        const letters = worstKeys.filter((key) => ALPHABET.includes(key))
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
        ensureMin("eaiou", (key) => VOWELS.includes(key), 2)
        ensureMin("tnshr", (key) => !VOWELS.includes(key), 1)

        const extras = worstKeys.filter((key) => isDrillDigit(key) || isDrillMark(key))
        const keys = [...letters, ...extras]

        setSelectedKeys(keys)
        dispatch(addAlert({ message: `Drilling your toughest keys: ${keys.join(", ")}`, type: "success" }))
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
        <div className="typecafe-keyboard flex flex-col w-full items-center justify-start py-3 pt-2 md:py-4">
            {mode === TestModes.practice ?
                // Wrapper hugs the keyboard's width so the Smart drill toolbar can
                // right-align flush with the keyboard's top-right corner.
                <div className="flex flex-col">
                    <div className="flex justify-end gap-2 pb-1">
                        <button
                            className={`btn btn-sm gap-1 normal-case shadow-sm focus:outline-0 ${shiftLayer ? "btn-secondary" : "btn-ghost"}`}
                            onClick={() => setShiftToggle((on) => !on)}
                            aria-pressed={shiftLayer}
                            aria-label="Show shifted keys (capitals and symbols)"
                            title="Show shifted keys (capitals & symbols) — or hold Shift"
                        >
                            ⇧ Shift
                        </button>
                        <button className="btn btn-primary btn-sm gap-1 normal-case shadow-sm focus:outline-0" onClick={handleSmartDrill} aria-label="Drill your eight least accurate keys" title="Drill your eight least accurate keys">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Zm0-12a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2Z" /></svg>
                            Smart drill
                        </button>
                    </div>
                    <KeyHeatmap
                        size="full"
                        attempts={buildStatsAttempts()}
                        lockedKeys={lockedKeys}
                        onKeyClick={handleKeyClicked}
                        currentKey={currentKey}
                        highlightKeys={highlightKeys}
                        shiftLayer={shiftLayer}
                        interactiveKeys={interactiveKeys}
                    />
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
                                    className={`kbd kbd-md sm:kbd-lg ${key === currentKey ? 'bg-primary text-primary-content' : highlightKeys?.includes(key) ? 'bg-secondary text-secondary-content' : ''}`}
                                >
                                    {key}
                                </kbd>
                            ))}
                        </div>
                    ))}
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        <kbd className={`kbd kbd-md sm:kbd-lg !min-w-[14rem] sm:!min-w-[17.5rem] ${currentKey === " " ? 'bg-primary text-primary-content' : ''}`}>&nbsp;</kbd>
                    </div>
                </>
            }
        </div>
    )
}

