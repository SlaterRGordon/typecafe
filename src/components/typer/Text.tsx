import { useEffect, useRef, useState } from "react"
import { buildText } from "./utils"

interface TextProps {
    text: string,
    restarted: boolean,
    onStart: () => void,
}

export const Text = (props: TextProps) => {
    const [elements, setElements] = useState<JSX.Element[]>([])
    const [position, setPosition] = useState(0)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    // event listeners to focus input
    useEffect(() => {
        document.getElementById("typer")?.addEventListener("click", () => {
            console.log("clicked")
            const input = inputRef.current
            if (input) input.focus()
        })
    }, [inputRef])

    useEffect(() => {
        if (props.restarted) {
            setPosition(0)
            setElements(buildText(props.text))
        }
    }, [props.restarted, props.text])

    // remove classes on reset/init
    useEffect(() => {
        const words = typerRef.current?.children
        if (words) {
            Array.from(words).forEach(word => {
                const letters = word.children
                Array.from(letters).forEach(letter => {
                    letter.setAttribute("class", "");
                })
            })
        }
    }, [elements])

    useEffect(() => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        if (current && typerRef.current) {
            current.classList.add("active-char", "text-primary")

            // scroll typer if new line
            const offset = current.offsetTop - typerRef.current.offsetTop;
            if (offset !== typerRef.current.scrollTop) {
                typerRef.current.scrollBy(0, offset - typerRef.current.scrollTop);
            }
        }
    }, [position, elements, typerRef])

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement

        if (current) {
            // check for correct key or incorrect
            if ((current.innerText.trim() === '' && e.key === ' ') || current.innerText.trim() === e.key) {
                nextLetter(true);
            } else if (
                (e.code == 'Space' && position > 0) || 
                e.key.length == 1 && ((e.key >= 'a' && e.key <= 'z') || (e.key >= 'A' && e.key <= 'Z'))
            ) {
                console.log(e.key)
                nextLetter(false);
            } else if (e.code === 'Backspace' && position > 0) {
                prevLetter();
            }
        }
    }

    const nextLetter = (correct: boolean) => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        if (current) {
            // update current char before moving on
            current.classList.remove("active-char", "text-primary")
            correct ? current.classList.add("text-base-300") : current.classList.add("text-secondary", "underline")

            // if position is at end of text
            if (position + 1 === props.text.length) {
                // complete test
            }

            setPosition(position => position + 1)
        }
    }

    const prevLetter = () => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        const previous = typerRef.current?.querySelector("#c" + (position-1).toString()) as HTMLDivElement

        if (current) {
            current.classList.remove("active-char", "text-primary")
            previous?.setAttribute("class", "")

            setPosition(position => position - 1)
        }
    }

    return (
        <div id="text" className="relative flex flex-col max-h-24 leading-[2rem] w-full overflow-hidden text-[22px] mb-8 max-w-screen-xl z-30">
            <input id="input" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex flex-wrap justify-center overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none" id="words" ref={typerRef}>
                {elements}
            </div>
        </div>
    )
}