import { useEffect, useRef, useState } from "react"
import { buildText } from "./utils"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    setCharacterCount: (count: number) => void,
    setIncorrectCount: (count: number) => void,
    onStart: () => void,
    onComplete: (correct: boolean) => void,
}

export const Text = (props: TextProps) => {
    const [elements, setElements] = useState<JSX.Element[]>([])
    const [position, setPosition] = useState(0)
    const [incorrect, setIncorrect] = useState<number>(0)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    // event listeners to focus input
    useEffect(() => {
        document.getElementById("typer")?.addEventListener("click", () => {
            const input = inputRef.current
            if (input) input.focus()
        })
        window.addEventListener("keydown", () => {
            const configModal = document.getElementById("configModal") as HTMLInputElement
            const colorModal = document.getElementById("colorModal") as HTMLInputElement
            const signInModal = document.getElementById("signInModal") as HTMLInputElement
            const usernameModal = document.getElementById("usernameModal") as HTMLInputElement
            
            const input = inputRef.current

            if (colorModal.checked) {
                const nameInput = document.getElementById("nameInput") as HTMLInputElement
                if (nameInput) nameInput.focus()
            }

            if (!configModal?.checked && 
                !colorModal?.checked && 
                !signInModal?.checked && 
                !usernameModal?.classList.contains("modal-open")
            ){
                if (input) input.focus()
            } else {
                if (input) input.blur()
            }
        })
    }, [inputRef])

    useEffect(() => {
        if (props.restarted) {
            setPosition(0)
            setIncorrect(0)
            setElements(buildText(props.text))
            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if(restartBtn) restartBtn.classList.remove("blinking", "text-primary")
            const input = inputRef.current
            if (input) input.focus()
        }
    }, [props.restarted, props.text])

    useEffect(() => {
        if (!props.started && !props.restarted) {
            const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if(restartBtn) restartBtn.classList.add("blinking", "text-primary")
            if (current) current.classList.value = ""
        }
    }, [props.started, props.restarted, position])

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

        if (current && props.restarted) {
            // check for correct key or incorrect
            if ((current.innerText.trim() === '' && e.key === ' ') || current.innerText.trim() === e.key) {
                nextLetter(true)
                // start timer
                if (position === 0 && !props.started) props.onStart()
            } else if (
                position > 0 &&
                (e.code == 'Space' || 
                e.key.length == 1 && ((e.key >= 'a' && e.key <= 'z') || (e.key >= 'A' && e.key <= 'Z')))
            ) {
                nextLetter(false)
                setIncorrect(incorrect => incorrect + 1)
            } else if (position > 0 && e.code === 'Backspace') {
                prevLetter()
            }
        }
    }

    const nextLetter = (correct: boolean) => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        if (current) {
            // update current char before moving on
            current.classList.remove("active-char", "text-primary")
            if (correct) {
                current.classList.add("text-base-300") 
            } else {
                current.classList.add("text-secondary", "underline")
            }

            // if position is at end of text
            if (position === props.text.length - 1) {
                props.onComplete(correct)
            }

            setPosition(position => position + 1)
        }
    }

    const prevLetter = () => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        const previous = typerRef.current?.querySelector("#c" + (position-1).toString()) as HTMLDivElement

        if (current) {
            if (["text-secondary", "underline"].some(className => previous.classList.contains(className))) {
                setIncorrect(incorrect => incorrect - 1)
            }
            current.classList.remove("active-char", "text-primary")
            previous?.setAttribute("class", "")

            setPosition(position => position - 1)
        }
    }

    useEffect(() => {
        props.setCharacterCount(position)
        props.setIncorrectCount(incorrect)
    }, [position, incorrect, props])

    return (
        <div id="text" className="relative flex flex-col max-h-24 leading-[2rem] overflow-hidden text-[22px] mb-8 max-w-screen-xl z-30">
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex flex-wrap justify-center overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none" id="words" ref={typerRef}>
                {elements}
            </div>
        </div>
    )
}