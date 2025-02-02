import { useEffect, useRef, useState } from "react"
import { buildText, generateText } from "./utils"
import { TestModes } from "./types"
import { init } from "next/dist/compiled/webpack/webpack"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    modalOpen: boolean,
    language: string,
    mode: TestModes,
    setCharacterCount: (count: number) => void,
    setIncorrectCount: (count: number) => void,
    onStart: () => void,
    onComplete: (correct: boolean) => void,
    onKeyChange: (key: string) => void,
}

export const Text = (props: TextProps) => {
    const [position, setPosition] = useState(0)
    const [incorrect, setIncorrect] = useState<number>(0)
    const textContainerRef = useRef<HTMLDivElement>(null)
    const charStatesRef = useRef<Map<number, 'correct' | 'incorrect'>>(new Map())
    const currentTextRef = useRef(props.text)
    const isAppendingRef = useRef(false)
    const [loadingText, setLoadingText] = useState(true)

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
            ) {
                if (input) input.focus()
            } else {
                if (input) input.blur()
            }
        })
    }, [inputRef])

    useEffect(() => {
        if (props.restarted) {
            currentTextRef.current = props.text
            charStatesRef.current.clear()
            renderInitialText(props.text)
            setPosition(0)
            setIncorrect(0)

            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if (restartBtn) restartBtn.classList.remove("blinking", "text-primary")
            const input = inputRef.current
            if (input && !props.modalOpen) input.focus()
        }
    }, [props.restarted, props.text])

    // Append new text when needed (relaxed mode)
    useEffect(() => {
        if (props.mode === TestModes.relaxed && !isAppendingRef.current) {
            const threshold = 300
            if (position >= currentTextRef.current.length - threshold) {
                isAppendingRef.current = true
                const newText = generateText(100, props.language)
                appendNewText(" " + newText)
                currentTextRef.current += newText
                isAppendingRef.current = false
            }
        }
    }, [position, props.mode, props.language])

    const renderInitialText = (text: string) => {
        if (!textContainerRef.current) return
        
        textContainerRef.current.innerHTML = ''
        const fragment = document.createDocumentFragment()
        
        text.split('').forEach((char, index) => {
            const span = createCharSpan(char, index)
            fragment.appendChild(span)
        })
        
        textContainerRef.current.appendChild(fragment)
        setLoadingText(false)
    }

    const appendNewText = (newText: string) => {
        if (!textContainerRef.current) return

        const fragment = document.createDocumentFragment()
        const startIndex = currentTextRef.current.length
        
        newText.split('').forEach((char, offset) => {
            const index = startIndex + offset
            const span = createCharSpan(char, index)
            fragment.appendChild(span)
        })

        textContainerRef.current.appendChild(fragment)
    }

    const createCharSpan = (char: string, index: number) => {
        const span = document.createElement('span')
        span.id = `c${index}`
        span.className = index === 0 ? 'active-char text-primary char' : 'char'
        span.textContent = char
        
        if (charStatesRef.current.has(index)) {
            const state = charStatesRef.current.get(index)
            span.classList.add(state === 'correct' ? 'text-base-300' : 'text-secondary')
        }
        
        return span
    }

    useEffect(() => {
        if (!props.started && !props.restarted) {
            const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if (restartBtn) restartBtn.classList.add("blinking", "text-primary")
            if (current) current.classList.value = ""
        }
    }, [props.started, props.restarted, position])

    useEffect(() => {
        const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
        if (current && typerRef.current) {
            current.classList.add("active-char", "text-primary")

            // scroll typer if new line
            const offset = current.offsetTop - typerRef.current.offsetTop
            if (offset !== typerRef.current.scrollTop) {
                typerRef.current.scrollBy(0, offset - typerRef.current.scrollTop)
            }
        }
    }, [position, typerRef])

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
            } else if (position > 0 && e.code === 'Backspace') {
                prevLetter()
            }
        }
    }

    const nextLetter = (correct: boolean) => {
        const currentIndex = position
        const currentChar = textContainerRef.current?.querySelector(`#c${currentIndex}`)
        
        if (currentChar) {
            // Update DOM immediately
            currentChar.classList.remove('active-char', 'text-primary')
            const stateClass = correct ? 'text-base-300' : 'text-secondary underline'
            currentChar.classList.add(...stateClass.split(' '))
    
            // Update state tracking
            charStatesRef.current.set(currentIndex, correct ? 'correct' : 'incorrect')
            
            // Update React state for position and incorrect count
            setPosition(prev => {
                const newPos = prev + 1
                
                // Track incorrect count in React state
                if (!correct) {
                    setIncorrect(prevIncorrect => prevIncorrect + 1)
                }
                
                return newPos
            })

            // Check if test is complete
            if (currentIndex === currentTextRef.current.length - 1) {
                props.onComplete(false)
            }
    
            // Update active character styling for new position
            const nextChar = textContainerRef.current?.querySelector(`#c${currentIndex + 1}`)
            if (nextChar) {
                nextChar.classList.add('active-char', 'text-primary')
            }
        }
    }
    
    const prevLetter = () => {
        if (position === 0) return
        
        const prevIndex = position - 1
        const prevChar = textContainerRef.current?.querySelector(`#c${prevIndex}`)
        const currentChar = textContainerRef.current?.querySelector(`#c${position}`)
        currentChar?.classList.remove('active-char', 'text-primary')
        
        if (prevChar) {
            // Reset DOM styling
            prevChar.classList.remove('text-base-300', 'text-secondary', 'underline')
            
            // Update state tracking
            const wasIncorrect = charStatesRef.current.get(prevIndex) === 'incorrect'
            charStatesRef.current.delete(prevIndex)
    
            // Update React states
            setPosition(prev => prev - 1)
            if (wasIncorrect) {
                setIncorrect(prev => prev - 1)
            }
    
            // Update active character styling
            prevChar.classList.add('active-char', 'text-primary')
        }
    }

    useEffect(() => {
        props.setCharacterCount(position)
        props.setIncorrectCount(incorrect)
        props.onKeyChange(textContainerRef.current?.querySelector(`#c${position}`)?.textContent || '')
    }, [position, incorrect, props])

    return (
        <div id="text" className="relative flex flex-col max-h-24 leading-[2rem] overflow-hidden text-[22px] mb-8 max-w-screen-xl z-30">
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex flex-wrap justify-center overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none" id="words" ref={typerRef}>
            <div 
                ref={textContainerRef}
                dangerouslySetInnerHTML={{ __html: '' }}
            />
                {loadingText && <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>}
            </div>
        </div>
    )
}