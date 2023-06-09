import { useEffect, useRef, useState } from "react"
import { buildText } from "./utils"

interface TextProps {
    text: string
}

export const Text = (props: TextProps) => {
    const [elements, setElements] = useState<JSX.Element[]>([])

    // ref div to scroll text
    const typerRef = useRef(null)

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        console.log(e.key)
    }

    useEffect(() => {
        setElements(buildText(props.text))
    }, [props.text])

    return (
        <div className="flex flex-col max-h-24 w-10/12 overflow-hidden text-[22px] max-w-screen-lg z-30">
            <input id="input" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} autoFocus />
            <div className="flex flex-wrap justify-center overflow-y-hidden no-scrollbar scroll-smooth text-textPrimary select-none" id="words" ref={typerRef}>
                {elements}
            </div>
        </div>
    )
}