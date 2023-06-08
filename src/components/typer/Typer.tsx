import { useEffect, useState } from "react"
import type { TestModes } from "./types"
import { generateText } from "./utils"
import { Text } from "./Text"

export const Typer = () => {
    const [mode, setMode] = useState<TestModes>("timed")
    const [count, setCount] = useState(15)
    const [text, setText] = useState("")

    useEffect(() => {
        if (mode === "timed") {
            setText(generateText(500))
        } else if (mode === "words") {
            setText(generateText(count))
        }
    }, [mode, count])

    return (
        <Text text={text} />
    )
}