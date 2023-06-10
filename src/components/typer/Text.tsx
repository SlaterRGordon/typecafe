import { useEffect, useRef, createRef, useState } from "react"
import { buildText } from "./utils"
import { set } from "zod"

interface TextProps {
    text: string,
    restart: () => void,
}

interface Keys {
    [key: string]: boolean
}

export const Text = (props: TextProps) => {
    const [restarting, setRestarting] = useState(false)
    const [elements, setElements] = useState<JSX.Element[]>([])
    const [position, setPosition] = useState(0)

    // ref div to scroll text
    const typerRef = useRef(null)

    // ref input to focus
    const inputRef = useRef(null)

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        console.log(e.key)
    }

    useEffect(() => {
        setElements(buildText(props.text))
    }, [props.text])

    // event listeners to focus input or restart
    useEffect(() => {
        let keys: Keys = {};
        window.addEventListener("click", () => {
            const input = inputRef.current as HTMLInputElement | null
            if (input) input.focus()
        })
        document.addEventListener("keydown", (e) => {
            e.preventDefault()
            const input = inputRef.current as HTMLInputElement | null
            if (input) input.focus()
            
            // add to currently pressed keys
            keys = {...keys, [e.key]: true};

            if (keys['Tab'] && (keys[' '] || keys['Enter']) && !restarting) {
                setRestarting(true)
                props.restart()
            }
        })
        document.addEventListener("keyup", (e) => {
            // remove from currently pressed keys
            keys = {...keys, [e.key]: false};
        });
    }, [inputRef, props, restarting])

    // useEffect(() => {

    // }, [position])

    return (
        <div className="flex flex-col max-h-24 w-full overflow-hidden text-[22px] max-w-screen-xl z-30">
            <input id="input" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex flex-wrap justify-center overflow-y-hidden no-scrollbar scroll-smooth text-textPrimary select-none" id="words" ref={typerRef}>
                {elements}
            </div>
        </div>
    )
}