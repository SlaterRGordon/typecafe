import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { generateText } from "./utils"
import { TestModes } from "./types"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    modalOpen: boolean,
    language: string,
    mode: TestModes,
    charAttempts: Map<string, { attempts: number, correct: number }>
    setCharacterCount: (count: number) => void,
    setIncorrectCount: (count: number) => void,
    onStart: () => void,
    onComplete: (correct: boolean) => void,
    onKeyChange: (key: string) => void,
    onAttemptChange?: () => void,
}

export const Text = (props: TextProps) => {
    const {
        text,
        started,
        restarted,
        modalOpen,
        language,
        mode,
        charAttempts,
        setCharacterCount,
        setIncorrectCount,
        onStart,
        onComplete,
        onKeyChange,
        onAttemptChange,
    } = props
    const [position, setPosition] = useState(0)
    const [incorrect, setIncorrect] = useState<number>(0)
    const textContainerRef = useRef<HTMLDivElement>(null)
    const charStatesRef = useRef<Map<number, 'correct' | 'incorrect'>>(new Map())
    const currentTextRef = useRef(text)
    const isAppendingRef = useRef(false)
    const [loadingText, setLoadingText] = useState(true)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    const createCharSpan = useCallback((char: string, index: number) => {
        const span = document.createElement('span')
        span.id = `c${index}`
        span.className = index === 0 ? 'active-char text-primary char' : 'char'
        span.textContent = char

        if (charStatesRef.current.has(index)) {
            const state = charStatesRef.current.get(index)
            span.classList.add(state === 'correct' ? 'text-base-300' : 'text-secondary')
        }

        return span
    }, [])

    const renderInitialText = useCallback((value: string) => {
        if (!textContainerRef.current) return

        textContainerRef.current.innerHTML = ''
        const fragment = document.createDocumentFragment()

        value.split('').forEach((char, index) => {
            const span = createCharSpan(char, index)
            fragment.appendChild(span)
        })

        textContainerRef.current.appendChild(fragment)
        setLoadingText(false)
    }, [createCharSpan])

    const appendNewText = useCallback((newText: string) => {
        if (!textContainerRef.current) return

        const fragment = document.createDocumentFragment()
        const startIndex = currentTextRef.current.length

        newText.split('').forEach((char, offset) => {
            const index = startIndex + offset
            const span = createCharSpan(char, index)
            fragment.appendChild(span)
        })

        textContainerRef.current.appendChild(fragment)
    }, [createCharSpan])

    // event listeners to focus input
    useEffect(() => {
        const handleTyperClick = () => {
            const input = inputRef.current
            if (input) input.focus()
        }
        const handleWindowKeydown = () => {
            const configModal = document.getElementById("configModal") as HTMLInputElement
            const colorModal = document.getElementById("colorModal") as HTMLInputElement
            const signInModal = document.getElementById("signInModal") as HTMLInputElement
            const usernameModal = document.getElementById("usernameModal") as HTMLInputElement

            const input = inputRef.current

            if (colorModal?.checked) {
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
        }
        const typer = document.getElementById("typer")

        typer?.addEventListener("click", handleTyperClick)
        window.addEventListener("keydown", handleWindowKeydown)

        return () => {
            typer?.removeEventListener("click", handleTyperClick)
            window.removeEventListener("keydown", handleWindowKeydown)
        }
    }, [])

    useLayoutEffect(() => {
        if (!restarted) return

        currentTextRef.current = text
        charStatesRef.current.clear()
        setLoadingText(text.length === 0)
        renderInitialText(text)
        setPosition(0)
        setIncorrect(0)

        const restartBtn = document.getElementById("restart") as HTMLButtonElement
        if (restartBtn) restartBtn.classList.remove("blinking", "text-primary")
        const input = inputRef.current
        if (input && !modalOpen) input.focus()
    }, [modalOpen, renderInitialText, restarted, text])

    // Append new text when needed (relaxed mode)
    useEffect(() => {
        if (mode === TestModes.relaxed && !isAppendingRef.current) {
            const threshold = 300
            if (position >= currentTextRef.current.length - threshold) {
                isAppendingRef.current = true
                const newText = generateText(100, language)
                appendNewText(" " + newText)
                currentTextRef.current += " " + newText
                isAppendingRef.current = false
            }
        }
    }, [appendNewText, language, mode, position])

    useEffect(() => {
        if (!started && !restarted) {
            const current = typerRef.current?.querySelector("#c" + position.toString()) as HTMLDivElement
            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if (restartBtn) restartBtn.classList.add("blinking", "text-primary")
            if (current) current.classList.value = ""
        }
    }, [started, restarted, position])

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

        if (current && restarted) {
            // check for correct key or incorrect
            if ((current.innerText.trim() === '' && e.key === ' ') || current.innerText.trim() === e.key) {
                nextLetter(true)
                // start timer
                if (position === 0 && !started) onStart()
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
            const char = currentChar.textContent || '';

            // Update DOM immediately
            currentChar.classList.remove('active-char', 'text-primary')
            const stateClass = correct ? 'text-base-300' : 'text-secondary underline'
            currentChar.classList.add(...stateClass.split(' '))

            // Update state tracking
            charStatesRef.current.set(currentIndex, correct ? 'correct' : 'incorrect')

            // Update attempts tracking
            const attempts = charAttempts.get(char) || { attempts: 0, correct: 0 };
            attempts.attempts += 1;
            if (correct) attempts.correct += 1;
            charAttempts.set(char, attempts);
            onAttemptChange?.();

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
                onComplete(correct)
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
        setCharacterCount(position)
        setIncorrectCount(incorrect)
        onKeyChange(textContainerRef.current?.querySelector(`#c${position}`)?.textContent || '')
    }, [position, incorrect, setCharacterCount, setIncorrectCount, onKeyChange])

    return (
        <div id="text" className="relative z-30 mb-8 flex w-full max-w-[calc(100vw-2rem)] max-h-24 leading-[2rem] flex-col overflow-hidden text-[20px] leading-[2rem] sm:max-h-24 sm:text-[22px] sm:leading-[2rem] md:max-w-screen-xl">
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex w-full flex-wrap justify-start overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none sm:justify-center" id="words" ref={typerRef}>
                <div
                    className="max-w-full"
                    ref={textContainerRef}
                />
                {loadingText && <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>}
            </div>
        </div>
    )
}
