import { useCallback, useEffect, useRef, useState } from "react"
import type { TestModes, TestSubModes } from "./types"
import { generateText } from "./utils"
import { Text } from "./Text"
import { ConfigModal } from "./ConfigModal"
import { Timer } from "./Timer"
import { Stats } from "./Stats"

export const Typer = () => {
    const [showStats, setShowStats] = useState(true)
    const [mode, setMode] = useState<TestModes>("normal")
    const [subMode, setSubMode] = useState<TestSubModes>("timed")
    const [count, setCount] = useState(15)
    const [text, setText] = useState("")
    const [started, setStarted] = useState(false)

    // ref for restart button
    const restartRef = useRef(null)

    const handleRestart = useCallback(() => {
        if (subMode === "timed") {
            setText(generateText(500))
        } else if (subMode === "words") {
            setText(generateText(count))
        }

        setStarted(false)
    }, [subMode, count])

    useEffect(() => {
        handleRestart()
    }, [handleRestart])

    const handleStart = () => {
        setStarted(true)
    }

    const handleComplete = () => {
        setStarted(false)
    }

    return (
        <div className="flex flex-col justify-center items-center w-11/12 md:w-8/12 space-y-2">
            <div className="flex relative justify-center items-center w-full gap-2 max-w-screen-xl">
                <div className="absolute left-0 invisible md:visible">
                    {showStats && <Stats wpm={0} accuracy={0.00} />}
                </div>
                {/* settings button */}
                <label className="btn btn-ghost btn-circle" htmlFor="configModal">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 16 16"><path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4ZM7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm3.618-3.602a.708.708 0 0 1-.824-.567l-.26-1.416a.354.354 0 0 0-.275-.282a6.072 6.072 0 0 0-2.519 0a.354.354 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.355.355 0 0 0-.382.095a5.99 5.99 0 0 0-1.262 2.173a.352.352 0 0 0 .108.378l1.102.931a.704.704 0 0 1 0 1.076l-1.102.931a.352.352 0 0 0-.108.378A5.986 5.986 0 0 0 3.53 12.02a.355.355 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.075 6.075 0 0 0 2.52 0a.353.353 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a5.99 5.99 0 0 0 1.262-2.173a.352.352 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.352.352 0 0 0 .108-.378A5.985 5.985 0 0 0 12.47 3.98a.355.355 0 0 0-.382-.095l-1.36.484a.71.71 0 0 1-.111.03Zm-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5.105 5.105 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977c.255.334.467.698.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a4.99 4.99 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5.099 5.099 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a4.987 4.987 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637a5.06 5.06 0 0 1 .63-1.084Z" /></svg>
                </label>
                {/* restart button */}
                <button className="btn btn-ghost btn-circle focus:outline-0" ref={restartRef} onClick={handleRestart} tabIndex={0}>
                    <svg id="restart" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"><path d="M12 3a9 9 0 1 1-5.657 2" /><path d="M3 4.5h4v4" /></g></svg>
                </button>
            </div>
            <Text text={text} restartRef={restartRef} restart={handleRestart} onStart={handleStart} />
            <div className="flex flex-col relative items-center w-full gap-4">
                {subMode === "timed" &&
                    <Timer started={started} onComplete={handleComplete} time={count} />
                }
                <div className="visible md:invisible">
                    {showStats && <Stats wpm={0} accuracy={0.00} />}
                </div>
            </div>
            <ConfigModal 
                mode={mode} setMode={setMode} 
                subMode={subMode} setSubMode={setSubMode} 
                count={count} setCount={setCount} 
                showStats={showStats} setShowStats={setShowStats} 
            />
        </div>
    )
}