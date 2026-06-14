import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { applyTextOptions, generateText } from "./utils"
import { TestModes, TestSubModes } from "./types"
import { isAnyModalOpen, isModalOpen, MODAL_IDS } from "~/lib/modals"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    modalOpen: boolean,
    language: string,
    mode: TestModes,
    subMode: TestSubModes,
    punctuation?: boolean,
    capitals?: boolean,
    charAttempts: Map<string, { attempts: number, correct: number }>
    setCharacterCount: (count: number) => void,
    setIncorrectCount: (count: number) => void,
    onStart: () => void,
    onComplete: (correct: boolean) => void,
    onKeyChange: (key: string) => void,
    onCharacterAttempt?: (attempt: { expected: string, typed: string, correct: boolean }) => void,
    onProgress?: (chars: number) => void,
    onAttemptChange?: () => void,
}

// Memoized: keystrokes mutate the DOM directly and report progress through
// stable callbacks, so this only re-renders when the test itself changes
// (new text, restart, mode/option changes).
export const Text = memo(function Text(props: TextProps) {
    const {
        text,
        started,
        restarted,
        modalOpen,
        language,
        mode,
        subMode,
        punctuation = false,
        capitals = false,
        charAttempts,
        setCharacterCount,
        setIncorrectCount,
        onStart,
        onComplete,
        onKeyChange,
        onCharacterAttempt,
        onProgress,
        onAttemptChange,
    } = props
    const [position, setPosition] = useState(0)
    const [incorrect, setIncorrect] = useState<number>(0)
    const positionRef = useRef(0)
    const incorrectRef = useRef(0)
    const textContainerRef = useRef<HTMLDivElement>(null)
    const charStatesRef = useRef<Map<number, 'correct' | 'incorrect'>>(new Map())
    const currentTextRef = useRef(text)
    const isAppendingRef = useRef(false)
    const completedRef = useRef(false)
    const callbacksRef = useRef({
        setCharacterCount,
        setIncorrectCount,
        onKeyChange,
    })
    const [loadingText, setLoadingText] = useState(true)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        callbacksRef.current = {
            setCharacterCount,
            setIncorrectCount,
            onKeyChange,
        }
    }, [setCharacterCount, setIncorrectCount, onKeyChange])

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
            const input = inputRef.current

            if (isModalOpen(MODAL_IDS.color)) {
                const nameInput = document.getElementById("nameInput") as HTMLInputElement
                if (nameInput) nameInput.focus()
            }

            if (!isAnyModalOpen()) {
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
        completedRef.current = false
        setLoadingText(text.length === 0)
        renderInitialText(text)
        positionRef.current = 0
        incorrectRef.current = 0
        setPosition(0)
        setIncorrect(0)

        const restartBtn = document.getElementById("restart") as HTMLButtonElement
        if (restartBtn) restartBtn.classList.remove("blinking", "text-primary")
        const input = inputRef.current
        if (input && !modalOpen) input.focus()
    }, [modalOpen, renderInitialText, restarted, text])

    // Append new text when needed. Relaxed mode scrolls forever; timed tests must
    // also never run out of text — a fast typist on a long custom duration would
    // otherwise exhaust the buffer and deadlock until the timer expires.
    const appendsText = mode === TestModes.relaxed ||
        (mode === TestModes.normal && subMode === TestSubModes.timed)
    useEffect(() => {
        if (appendsText && !isAppendingRef.current) {
            const threshold = 300
            if (position >= currentTextRef.current.length - threshold) {
                isAppendingRef.current = true
                const newText = applyTextOptions(generateText(100, language), punctuation, capitals)
                appendNewText(" " + newText)
                currentTextRef.current += " " + newText
                isAppendingRef.current = false
            }
        }
    }, [appendNewText, appendsText, language, position, punctuation, capitals])

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
            typerRef.current.querySelectorAll(".active-char").forEach((char) => {
                if (char !== current) char.classList.remove("active-char", "text-primary")
            })
            current.classList.add("active-char", "text-primary")

            // scroll typer if new line
            const offset = current.offsetTop - typerRef.current.offsetTop
            if (offset !== typerRef.current.scrollTop) {
                typerRef.current.scrollBy(0, offset - typerRef.current.scrollTop)
            }
        }
    }, [position, typerRef])

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (completedRef.current) return

        const currentPosition = positionRef.current
        const current = typerRef.current?.querySelector("#c" + currentPosition.toString()) as HTMLDivElement

        if (current && restarted) {
            // check for correct key or incorrect
            if ((current.innerText.trim() === '' && e.key === ' ') || current.innerText.trim() === e.key) {
                nextLetter(true, e.key)
                // start timer
                if (currentPosition === 0 && !started) onStart()
            } else if (e.code == 'Space' || e.key.length == 1) {
                // Any single printable key (letter, capital, punctuation, symbol) that
                // does not match the expected character counts as an incorrect attempt —
                // including on the very first character, which also starts the timer.
                nextLetter(false, e.key)
                if (currentPosition === 0 && !started) onStart()
            } else if (currentPosition > 0 && e.code === 'Backspace') {
                prevLetter()
            }
        }
    }

    const nextLetter = (correct: boolean, typed: string) => {
        const currentIndex = positionRef.current
        const currentChar = textContainerRef.current?.querySelector(`#c${currentIndex}`)

        if (currentChar) {
            const char = currentChar.textContent || '';
            onCharacterAttempt?.({ expected: char, typed, correct });

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
            const nextPosition = currentIndex + 1
            positionRef.current = nextPosition
            setPosition(nextPosition)
            onProgress?.(nextPosition)

            if (!correct) {
                incorrectRef.current += 1
                setIncorrect(incorrectRef.current)
            }

            // Check if test is complete
            if (currentIndex === currentTextRef.current.length - 1) {
                completedRef.current = true
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
        const currentPosition = positionRef.current
        if (currentPosition === 0) return

        const prevIndex = currentPosition - 1
        const prevChar = textContainerRef.current?.querySelector(`#c${prevIndex}`)
        const currentChar = textContainerRef.current?.querySelector(`#c${currentPosition}`)
        currentChar?.classList.remove('active-char', 'text-primary')

        if (prevChar) {
            // Reset DOM styling
            prevChar.classList.remove('text-base-300', 'text-secondary', 'underline')

            // Update state tracking
            const wasIncorrect = charStatesRef.current.get(prevIndex) === 'incorrect'
            charStatesRef.current.delete(prevIndex)

            // Update React states
            positionRef.current = prevIndex
            setPosition(prevIndex)
            onProgress?.(prevIndex)
            if (wasIncorrect) {
                incorrectRef.current = Math.max(incorrectRef.current - 1, 0)
                setIncorrect(incorrectRef.current)
            }

            // Update active character styling
            prevChar.classList.add('active-char', 'text-primary')
        }
    }

    useEffect(() => {
        callbacksRef.current.setCharacterCount(position)
        callbacksRef.current.setIncorrectCount(incorrect)
        callbacksRef.current.onKeyChange(textContainerRef.current?.querySelector(`#c${position}`)?.textContent || '')
    }, [position, incorrect])

    return (
        <div id="text" className="relative z-30 mb-8 flex w-full max-w-[calc(100vw-2rem)] max-h-24 leading-[2rem] flex-col overflow-hidden text-[20px] leading-[2rem] sm:max-h-24 sm:text-[22px] sm:leading-[2rem] md:max-w-screen-xl">
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            <div className="flex w-full flex-wrap justify-start overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none sm:justify-start" id="words" ref={typerRef}>
                <div
                    className="max-w-full"
                    ref={textContainerRef}
                />
                {loadingText && <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>}
            </div>
        </div>
    )
})
