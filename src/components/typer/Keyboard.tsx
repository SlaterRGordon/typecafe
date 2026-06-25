import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { useDispatch } from "react-redux";
import { useState } from "react";
import { worstKeysFromAttempts } from "~/lib/stats";
import { foldAttempts } from "~/lib/heatmap";
import { isDrillDigit, isDrillMark } from "./utils";
import { KeyHeatmap } from "~/components/heatmap/KeyHeatmap";

const VOWELS = "aeiou"
const CONSONANTS = "bcdfghjklmnpqrstvwxyz"
const ALPHABET = "abcdefghijklmnopqrstuvwxyz"
const isDrillable = (key: string) => ALPHABET.includes(key) || isDrillDigit(key) || isDrillMark(key)

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

    const [showStats, setShowStats] = useState(false)

    const handleKeyClicked = (key: string) => {
        if (!selectedKeys || !setSelectedKeys || mode !== TestModes.practice) return

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

    // Build a practice set from the user's six least-accurate keys (folded
    // lifetime + session attempts) across letters, numbers and punctuation. The
    // worst letters anchor word generation — padded with home-row keys and
    // balanced so generation always has a vowel and a consonant; any weak
    // numbers/punctuation ride along as extra drill targets sprinkled into the text.
    const handleSmartDrill = () => {
        if (!setSelectedKeys || mode !== TestModes.practice) return

        const drillable = new Map<string, { attempts: number, correct: number }>()
        for (const [key, value] of buildStatsAttempts()) {
            if (isDrillable(key)) drillable.set(key, value)
        }

        const worst = worstKeysFromAttempts(drillable, 6, 5)
        if (worst.length === 0) {
            dispatch(addAlert({ message: "Not enough typing data yet — practice a little first!", type: "warning" }))
            return
        }
        const worstKeys = worst.map((entry) => entry.key)

        // Letters anchor word-gen: keep the weak letters, pad to six, guarantee a
        // vowel + consonant.
        const letters = worstKeys.filter((key) => ALPHABET.includes(key))
        for (const key of "asdfghjkleiou") {
            if (letters.length >= 6) break
            if (!letters.includes(key)) letters.push(key)
        }
        if (!letters.some((key) => VOWELS.includes(key))) letters[letters.length - 1] = "e"
        if (!letters.some((key) => !VOWELS.includes(key))) letters[letters.length - 1] = "t"

        const extras = worstKeys.filter((key) => isDrillDigit(key) || isDrillMark(key))
        const keys = [...letters, ...extras]

        setSelectedKeys(keys)
        dispatch(addAlert({ message: `Drilling your toughest keys: ${keys.join(", ")}`, type: "success" }))
    }

    // Combined lifetime + live-session per-key tally that feeds the analytics
    // heatmap, folded onto physical keys so capitals/numbers/punctuation land on
    // their real key. Kept as a Map for the data-source-agnostic <KeyHeatmap>.
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
        return foldAttempts(merged)
    }

    return (
        <div className="typecafe-keyboard flex flex-col w-full items-center justify-start py-3 pt-2 md:py-4">
            {mode === TestModes.practice && (
                <div className="flex items-center justify-end gap-1 w-[30.7rem]">
                    <button className="btn btn-ghost btn-sm normal-case focus:outline-0" onClick={handleSmartDrill} aria-label="Drill your six least accurate keys" title="Drill your six least accurate keys">
                        Smart drill
                    </button>
                    {showStats ?
                        <div className="btn btn-ghost btn-circle focus:outline-0" onClick={() => setShowStats(false)} role="button" aria-label="Hide keyboard accuracy stats" title="Hide keyboard accuracy stats" tabIndex={0}>
                            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" /><path d="M0 0h24v24H0zm0 0h24v24H0z" fill="none" /></svg>
                        </div>
                        :
                        <div className="btn btn-ghost btn-circle focus:outline-0" onClick={() => setShowStats(true)} role="button" aria-label="Show keyboard accuracy stats" title="Show keyboard accuracy stats" tabIndex={0}>
                            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><rect fill="none" height="24" width="24" /><g><path d="M19.88,18.47c0.44-0.7,0.7-1.51,0.7-2.39c0-2.49-2.01-4.5-4.5-4.5s-4.5,2.01-4.5,4.5s2.01,4.5,4.49,4.5 c0.88,0,1.7-0.26,2.39-0.7L21.58,23L23,21.58L19.88,18.47z M16.08,18.58c-1.38,0-2.5-1.12-2.5-2.5c0-1.38,1.12-2.5,2.5-2.5 s2.5,1.12,2.5,2.5C18.58,17.46,17.46,18.58,16.08,18.58z M15.72,10.08c-0.74,0.02-1.45,0.18-2.1,0.45l-0.55-0.83l-3.8,6.18 l-3.01-3.52l-3.63,5.81L1,17l5-8l3,3.5L13,6C13,6,15.72,10.08,15.72,10.08z M18.31,10.58c-0.64-0.28-1.33-0.45-2.05-0.49 c0,0,5.12-8.09,5.12-8.09L23,3.18L18.31,10.58z" /></g></svg>
                        </div>
                    }
                </div>
            )}

            {mode === TestModes.practice && showStats ?
                <KeyHeatmap size="full" attempts={buildStatsAttempts()} />
                :
                <>
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        {letters.slice(0, 10).split("").map((key: string, index: number) => {
                            if (key == currentKey) return (
                                <kbd
                                    key={index}
                                    className="kbd kbd-md sm:kbd-lg bg-primary text-primary-content cursor-pointer"
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {key}
                                </kbd>
                            )

                            return (
                                <kbd
                                    key={index}
                                    className={`relative kbd kbd-md sm:kbd-lg ${highlightKeys?.includes(key) ? 'bg-secondary text-secondary-content' : ''} ${!selectedKeys ? '' : (selectedKeys.includes(key) || mode !== TestModes.practice) ? 'kbd-unlocked' : 'kbd-locked bg-base-100 text-base-content'}`}
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {selectedKeys && !selectedKeys.includes(key) && mode === TestModes.practice && <div className="absolute top-0 right-0 p-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                    </div>}
                                    {key}
                                </kbd>
                            )
                        })}
                    </div>
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        {letters.slice(10, 19).split("").map((key: string, index: number) => {
                            if (key == currentKey) return (
                                <kbd
                                    key={index}
                                    className="kbd kbd-md sm:kbd-lg bg-primary text-primary-content cursor-pointer"
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {key}
                                </kbd>
                            )

                            return (
                                <kbd
                                    key={index}
                                    className={`relative kbd kbd-md sm:kbd-lg ${highlightKeys?.includes(key) ? 'bg-secondary text-secondary-content' : ''} ${!selectedKeys ? '' : (selectedKeys.includes(key) || mode !== TestModes.practice) ? 'kbd-unlocked' : 'kbd-locked bg-base-100 text-base-content'}`}
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {selectedKeys && !selectedKeys.includes(key) && mode === TestModes.practice && <div className="absolute top-0 right-0 p-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                    </div>}
                                    {key}
                                </kbd>
                            )
                        })}
                    </div>
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        {letters.slice(19, 26).split("").map((key: string, index: number) => {
                            if (key == currentKey) return (
                                <kbd
                                    key={index}
                                    className="kbd kbd-md sm:kbd-lg bg-primary text-primary-content cursor-pointer"
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {key}
                                </kbd>
                            )

                            return (
                                <kbd
                                    key={index}
                                    className={`relative kbd kbd-md sm:kbd-lg ${highlightKeys?.includes(key) ? 'bg-secondary text-secondary-content' : ''} ${!selectedKeys ? '' : (selectedKeys.includes(key) || mode !== TestModes.practice) ? 'kbd-unlocked' : 'kbd-locked bg-base-100 text-base-content'}`}
                                    onClick={() => handleKeyClicked(key)}
                                >
                                    {selectedKeys && !selectedKeys.includes(key) && mode === TestModes.practice && <div className="absolute top-0 right-0 p-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                    </div>}
                                    {key}
                                </kbd>
                            )
                        })}
                    </div>
                    <div className="flex justify-center gap-0.5 my-0.5 w-full md:gap-1 md:my-1">
                        {currentKey == " " ?
                            <kbd className="kbd kbd-md sm:kbd-lg bg-primary text-primary-content !min-w-[14rem] sm:!min-w-[17.5rem]">&nbsp;</kbd>
                            :
                            <kbd className="kbd kbd-md sm:kbd-lg !min-w-[14rem] sm:!min-w-[17.5rem]">&nbsp;</kbd>
                        }
                    </div>
                </>
            }
        </div>
    )
}

