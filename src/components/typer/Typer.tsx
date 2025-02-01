import React, { useCallback, useEffect, useRef, useState } from "react"
import { TestGramScopes, TestSubModes } from "./types"
import { TestGramSources, TestModes } from "./types"
import { generateNGram, generatePseudoText, generateText, getGramLevelText } from "./utils"
import { Text } from "./Text"
import { Stats } from "./Stats"
import { useTimer } from "~/hooks/timer/useTimer"
import { api } from "~/utils/api"
import type { Level } from "./learn/levels"

interface Keys {
    [key: string]: boolean
}

interface TyperProps {
    language: string,
    mode: TestModes,
    subMode: TestSubModes,
    gramSource: TestGramSources, 
    gramScope: TestGramScopes,
    gramCombination: number, 
    gramRepetition: number,
    count: number,
    level?: Level,
    onKeyChange?(key: string): void,
    onTestComplete?(): void,
    showStats: boolean,
    modalOpen: boolean,
    setModalOpen(open: boolean): void,
    showConfig: boolean,
}

export const Typer = (props: TyperProps) => {
    const { 
        language, 
        mode, subMode, 
        gramSource, gramScope, gramCombination, gramRepetition, 
        count, showStats, showConfig, 
        modalOpen,
        setModalOpen
    } = props

    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)
    const [restarted, setRestarted] = useState(true)
    const [characterCount, setCharacterCount] = useState(0)
    const [incorrectCount, setIncorrectCount] = useState(0)
    const [wpm, setWpm] = useState(0.00)
    const [gramWpm, setGramWpm] = useState(0.00)
    const [accuracy, setAccuracy] = useState(0.00)
    const [gramLevel, setGramLevel] = useState<number>(1)

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language })

    // create test
    const createTest = api.test.create.useMutation({
        onSuccess: () => {
            // console.log("test created")
        },
        onError: (error) => {
            console.log(error)
        }
    })

    const { time, start, pause, reset, setInitialTime, actualStartTime } = useTimer({
        _initialTime: subMode === TestSubModes.timed ? count : 0,
        timerType: subMode === TestSubModes.timed ? 'DECREMENTAL' : 'INCREMENTAL',
        endTime: subMode === TestSubModes.timed ? 0 : 999999,
        onTimeOver: () => {
            setStarted(false)
            setRestarted(false)

            createTest.mutate({
                typeId: testType?.id as string,
                accuracy: accuracy,
                speed: wpm,
                score: wpm * accuracy,
                count: count,
                options: props.level ? props.level.name : ""
            })
        },
    })

    useEffect(() => {
        if (subMode === TestSubModes.timed && mode === TestModes.normal) setInitialTime(count)
        else setInitialTime(0)

    }, [count, setInitialTime, mode, subMode])

    useEffect(() => {
        if (mode === TestModes.ngrams) {
            setGramLevel(1)
            setGramWpm(0.00)
        }
    }, [mode, subMode, gramSource, gramScope, gramCombination, gramRepetition])

    // ref for restart button
    const restartRef = useRef(null)

    const handleRestart = useCallback(() => {
        if (mode === TestModes.normal) {
            if (subMode === TestSubModes.timed) {
                setText(generateText(500, language))
            } else if (subMode === TestSubModes.words) {
                if (props.level) setText(generatePseudoText(count, language, props.level.keys.split("")))
                else setText(generateText(count, language))
            }
        } else if (mode === TestModes.ngrams) {
            setText(generateNGram(gramSource, gramScope, gramCombination, gramRepetition, gramLevel))
        }

        reset()
        setStarted(false)
        setRestarted(true)
        setCharacterCount(0)
    }, [language, mode, subMode, gramSource, gramScope, gramCombination, gramRepetition, gramLevel, count, props.level, reset])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    const handleStart = () => {
        start()
        setStarted(true)
    }
    const handleComplete = (correct: boolean) => {
        const actualEndTime = Date.now()
        setStarted(false)
        setRestarted(false)

        if (mode == TestModes.normal) {
            createTest.mutate({
                typeId: testType?.id as string,
                accuracy: accuracy,
                speed: wpm,
                score: wpm * accuracy,
                count: count,
                options: props.level ? props.level.name : ""
            })
        } else if (mode == TestModes.ngrams) {

            if (incorrectCount == 0 && correct) {
                if (gramScope == TestGramScopes.fifty && gramLevel < 49) {
                    const minutes = (actualEndTime - actualStartTime) / 60000;
                    const newWpm = (characterCount / 5) / minutes

                    if (gramLevel !== 1) setGramWpm(((gramWpm * gramLevel) + newWpm) / (gramLevel + 1))
                    else setGramWpm(newWpm)

                    setGramLevel(gramLevel + 1)

                    handleRestart()
                } else if (gramScope == TestGramScopes.fifty && gramLevel == 49) {
                    setGramWpm(0.00)
                    setGramLevel(1)
                }
            }
        }

        if (props.onTestComplete) props.onTestComplete()
    }

    const handleSetCharacterCount = (charCount: number) => {
        if (props.onKeyChange) props.onKeyChange(text[charCount] as string)
        setCharacterCount(charCount)
    }
    const handleSetIncorrectCount = (charCount: number) => setIncorrectCount(charCount)

    useEffect(() => {
        // calculate minutes
        const normalizedSeconds = subMode == TestSubModes.timed ? count - time : time
        const minutes = normalizedSeconds / 60
        // calculate wpm
        if (minutes == 0) setWpm(0)
        else setWpm((characterCount / 5) / minutes)
        // calculate accuracy
        const correct = characterCount - incorrectCount
        if (characterCount == 0) setAccuracy(0)
        else setAccuracy(correct / characterCount * 100)
    }, [count, characterCount, incorrectCount, time, mode, subMode, gramSource, gramScope, gramCombination, gramRepetition, gramLevel])

    useEffect(() => {
        let keys: Keys = {};
        document.addEventListener("keydown", (e) => {
            console.log(modalOpen)
            if (modalOpen) return;
            // add to currently pressed keys
            keys = { ...keys, [e.key]: true };

            if (keys['Tab']) {
                e.preventDefault()
                const restartBtn = restartRef.current as HTMLButtonElement | null
                if (restartBtn) {
                    restartBtn.classList.add("btn-active")
                    restartBtn.focus()
                }
            }

            if (keys['Tab'] && (keys[' '] || keys['Enter'])) {
                handleRestart()
            }
        })
        document.addEventListener("keyup", (e) => {
            if (modalOpen) return;
            // remove from currently pressed keys
            keys = { ...keys, [e.key]: false };

            if (e.key == 'Tab') {
                const restartBtn = restartRef.current as HTMLButtonElement | null
                if (restartBtn) {
                    restartBtn.classList.remove("btn-active")
                    restartBtn.blur()
                }
            }
        });
    }, [handleRestart])

    return (
        <div className="flex flex-col py-8 sm:py-0 sm:justify-center items-center mx-4 md:mx-0 space-y-2">
            <div className="flex relative justify-center items-center w-full gap-2 max-w-screen-xl">
                <div className={`absolute flex items-center h-full left-0 invisible ${ text.length > 38 ? "md:visible" : ""}`}>
                    {showStats && 
                        <Stats mode={mode} wpm={wpm} accuracy={accuracy} 
                            averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)} 
                        />
                    }
                </div>
                {/* settings button */}
                {showConfig &&
                    <label className="btn btn-ghost btn-circle" htmlFor="configModal">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 16 16"><path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4ZM7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm3.618-3.602a.708.708 0 0 1-.824-.567l-.26-1.416a.354.354 0 0 0-.275-.282a6.072 6.072 0 0 0-2.519 0a.354.354 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.355.355 0 0 0-.382.095a5.99 5.99 0 0 0-1.262 2.173a.352.352 0 0 0 .108.378l1.102.931a.704.704 0 0 1 0 1.076l-1.102.931a.352.352 0 0 0-.108.378A5.986 5.986 0 0 0 3.53 12.02a.355.355 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.075 6.075 0 0 0 2.52 0a.353.353 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a5.99 5.99 0 0 0 1.262-2.173a.352.352 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.352.352 0 0 0 .108-.378A5.985 5.985 0 0 0 12.47 3.98a.355.355 0 0 0-.382-.095l-1.36.484a.71.71 0 0 1-.111.03Zm-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5.105 5.105 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977c.255.334.467.698.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a4.99 4.99 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5.099 5.099 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a4.987 4.987 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637a5.06 5.06 0 0 1 .63-1.084Z" /></svg>
                    </label>
                }
                {/* restart button */}
                <button className="btn btn-ghost btn-circle focus:outline-0" ref={restartRef} onClick={handleRestart} tabIndex={0}>
                    <svg id="restart" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><path d="M12 3a9 9 0 1 1-5.657 2" /><path d="M3 4.5h4v4" /></g></svg>
                </button>
            </div>
            <Text
                text={text}
                started={started} restarted={restarted}
                modalOpen={props.modalOpen}
                onStart={handleStart}
                onComplete={handleComplete}
                setCharacterCount={handleSetCharacterCount}
                setIncorrectCount={handleSetIncorrectCount}
            />
            <div className="flex flex-col relative items-center w-full">
                {subMode === TestSubModes.timed &&
                    <div className={`py-2`}>
                        <span className={`flex font-mono text-4xl gap-4`}>
                            <span className="flex">{time}</span>
                        </span>
                    </div>
                }
                <div className={`visible ${ text.length > 38 ? "md:invisible" : ""}`} >
                    {showStats && 
                        <Stats mode={mode} wpm={wpm} accuracy={accuracy} 
                            averageWpm={gramWpm} levelText={getGramLevelText(gramLevel, gramCombination, gramScope)} 
                        />
                    }
                </div>
            </div>
        </div>
    )
}