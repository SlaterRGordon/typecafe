import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { applyTextOptions, generateText } from "./utils"
import { TestModes, TestSubModes } from "./types"
import { isAnyModalOpen, isModalOpen, MODAL_IDS } from "~/lib/modals"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    // Increments on every restart; forces the reset effect to re-run even when the
    // regenerated text is byte-identical (e.g. a grams level's deterministic gram).
    restartNonce?: number,
    modalOpen: boolean,
    language: string,
    mode: TestModes,
    subMode: TestSubModes,
    punctuation?: boolean,
    capitals?: boolean,
    // Challenge runs use fixed seeded text; never append generated words (which
    // would break the byte-identical-across-clients guarantee).
    noAppend?: boolean,
    // Boss levels: a pacer line glides across the text at this net WPM. If it
    // catches the typist's cursor the run ends early (overtake = death).
    pacerWpm?: number,
    onPacerCaught?: () => void,
    charAttempts: Map<string, { attempts: number, correct: number }>
    onStart: () => void,
    onComplete: () => void,
    onKeyChange: (key: string) => void,
    onCharacterAttempt?: (attempt: { expected: string, typed: string, correct: boolean }) => void,
    onBackspace?: () => void,
    onAttemptChange?: () => void,
}

// True for editable form controls. The toolbar and its subpanels live inside
// #typer, so their inputs would otherwise have focus yanked back to the hidden
// typing input on click/keystroke/restart — making them un-editable.
function isEditableElement(el: Element | EventTarget | null): boolean {
    const node = el as HTMLElement | null
    if (!node || !node.tagName) return false
    const tag = node.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable
}

// Memoized: keystrokes mutate the DOM directly and report progress through
// stable callbacks, so this only re-renders when the test itself changes
// (new text, restart, mode/option changes).
export const Text = memo(function Text(props: TextProps) {
    const {
        text,
        started,
        restarted,
        restartNonce,
        modalOpen,
        language,
        mode,
        subMode,
        punctuation = false,
        capitals = false,
        noAppend = false,
        pacerWpm,
        onPacerCaught,
        charAttempts,
        onStart,
        onComplete,
        onKeyChange,
        onCharacterAttempt,
        onBackspace,
        onAttemptChange,
    } = props
    const [position, setPosition] = useState(0)
    const positionRef = useRef(0)
    const textContainerRef = useRef<HTMLDivElement>(null)
    const charStatesRef = useRef<Map<number, 'correct' | 'incorrect'>>(new Map())
    const currentTextRef = useRef(text)
    const isAppendingRef = useRef(false)
    const completedRef = useRef(false)
    const callbacksRef = useRef({ onKeyChange })
    const [loadingText, setLoadingText] = useState(true)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    // The pacer line and the moment the attempt started (set on the first
    // keystroke, the same instant onStart fires).
    const pacerLineRef = useRef<HTMLDivElement>(null)
    // The "pacer is above" hint shown when it scrolls out of the top of the view.
    const pacerAboveRef = useRef<HTMLDivElement>(null)
    const pacerStartRef = useRef(0)
    // Latest overtake callback without making it a dependency of the pacer loop.
    const onPacerCaughtRef = useRef(onPacerCaught)

    useEffect(() => {
        callbacksRef.current = { onKeyChange }
    }, [onKeyChange])

    useEffect(() => {
        onPacerCaughtRef.current = onPacerCaught
    }, [onPacerCaught])

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
        // The toolbar now lives inside #typer, so its own form fields (the
        // custom-length input, dropdowns) would otherwise have focus yanked back
        // to the hidden typing input on every click/keystroke — making them
        // un-editable. Skip the auto-focus whenever the user is interacting with
        // another editable control.
        const isEditableTarget = (target: EventTarget | null) =>
            target !== inputRef.current && isEditableElement(target)
        const handleTyperClick = (event: MouseEvent) => {
            if (isEditableTarget(event.target)) return
            const input = inputRef.current
            // preventScroll: the hidden input sits below the toolbar/subpanels, so a
            // plain focus would scroll them out of view (and under the fixed navbar).
            if (input) input.focus({ preventScroll: true })
        }
        const handleWindowKeydown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return
            const input = inputRef.current

            if (isModalOpen(MODAL_IDS.color)) {
                const nameInput = document.getElementById("nameInput") as HTMLInputElement
                if (nameInput) nameInput.focus()
            }

            if (!isAnyModalOpen()) {
                if (input) input.focus({ preventScroll: true })
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
        setPosition(0)

        const restartBtn = document.getElementById("restart") as HTMLButtonElement
        if (restartBtn) restartBtn.classList.remove("blinking", "text-primary")
        const input = inputRef.current
        // A config change (e.g. editing a grams-subpanel field) regenerates text
        // and lands here; don't yank focus away from a control the user is editing.
        const active = document.activeElement
        if (input && !modalOpen && (active === input || !isEditableElement(active))) input.focus({ preventScroll: true })
    }, [modalOpen, renderInitialText, restarted, text, restartNonce])

    // Append new text when needed. Relaxed mode scrolls forever; timed tests must
    // also never run out of text — a fast typist on a long custom duration would
    // otherwise exhaust the buffer and deadlock until the timer expires.
    const appendsText = !noAppend && (mode === TestModes.relaxed ||
        (mode === TestModes.normal && subMode === TestSubModes.timed))
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

    // First keystroke: start the clock the pacer races against, then the timer.
    const startAttempt = () => {
        pacerStartRef.current = performance.now()
        onStart()
    }

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (completedRef.current) return

        const currentPosition = positionRef.current
        const current = typerRef.current?.querySelector("#c" + currentPosition.toString()) as HTMLDivElement

        if (current && restarted) {
            // check for correct key or incorrect
            if ((current.innerText.trim() === '' && e.key === ' ') || current.innerText.trim() === e.key) {
                nextLetter(true, e.key)
                // start timer
                if (currentPosition === 0 && !started) startAttempt()
            } else if (e.code == 'Space' || e.key.length == 1) {
                // Any single printable key (letter, capital, punctuation, symbol) that
                // does not match the expected character counts as an incorrect attempt —
                // including on the very first character, which also starts the timer.
                nextLetter(false, e.key)
                if (currentPosition === 0 && !started) startAttempt()
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

            // Check if test is complete
            if (currentIndex === currentTextRef.current.length - 1) {
                completedRef.current = true
                onComplete()
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
            charStatesRef.current.delete(prevIndex)

            // Update React states
            positionRef.current = prevIndex
            setPosition(prevIndex)
            // The recorder owns the net character/incorrect counts; tell it a
            // committed key was walked back.
            onBackspace?.()

            // Update active character styling
            prevChar.classList.add('active-char', 'text-primary')
        }
    }

    useEffect(() => {
        callbacksRef.current.onKeyChange(textContainerRef.current?.querySelector(`#c${position}`)?.textContent || '')
    }, [position])

    // Boss pacer: a vertical line glides across the text at pacerWpm. It advances
    // on a continuous clock (rAF), interpolating between character boxes so it
    // slides smoothly rather than jumping per character. If it consumes as many
    // characters as the typist has (it reached the cursor), the run ends —
    // overtake = death. Only runs once typing has started and a pacer is set.
    useEffect(() => {
        const line = pacerLineRef.current
        const above = pacerAboveRef.current
        if (!line) return
        if (!started || !pacerWpm) {
            line.style.display = 'none'
            if (above) above.style.display = 'none'
            return
        }
        const words = typerRef.current
        const container = textContainerRef.current
        if (!words || !container) return

        const charsPerSec = pacerWpm * 5 / 60
        let raf = 0

        const tick = () => {
            const elapsed = (performance.now() - pacerStartRef.current) / 1000
            const pacerChars = Math.max(0, elapsed * charsPerSec)

            // Overtake: the pacer has reached the character the typist is on.
            if (!completedRef.current && pacerChars >= positionRef.current) {
                completedRef.current = true
                line.style.display = 'none'
                if (above) above.style.display = 'none'
                onPacerCaughtRef.current?.()
                return
            }

            const index = Math.floor(pacerChars)
            const frac = pacerChars - index
            const a = container.querySelector(`#c${index}`) as HTMLElement | null
            const b = container.querySelector(`#c${index + 1}`) as HTMLElement | null
            if (a) {
                // Interpolate within the line; at a line wrap, slide to a's right edge.
                const sameLine = b !== null && b.offsetTop === a.offsetTop
                const right = sameLine ? b!.offsetLeft : a.offsetLeft + a.offsetWidth
                const x = a.offsetLeft + frac * (right - a.offsetLeft)
                const y = a.offsetTop - words.scrollTop
                // When the typist races ahead, the pacer's line scrolls off the top
                // and clips. Rather than lose it, show an up-caret riding the top edge
                // at the pacer's horizontal position, so where it is stays legible.
                if (y < 0) {
                    line.style.display = 'none'
                    if (above) {
                        above.style.display = 'block'
                        above.style.transform = `translate(${x - 4}px, 0)`
                    }
                } else {
                    line.style.display = 'block'
                    line.style.height = `${a.offsetHeight}px`
                    line.style.transform = `translate(${x}px, ${y}px)`
                    if (above) above.style.display = 'none'
                }
            }
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)

        return () => {
            cancelAnimationFrame(raf)
            line.style.display = 'none'
            if (above) above.style.display = 'none'
        }
    }, [started, pacerWpm, restartNonce, text])

    return (
        <div id="text" className="relative z-30 mb-8 flex w-full max-w-[calc(100vw-2rem)] max-h-[6.6rem] leading-[2.2rem] flex-col overflow-hidden text-[24px] sm:max-h-[9rem] sm:text-[34px] sm:leading-[3rem] md:max-w-screen-xl">
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            {/* Boss pacer line — positioned and animated imperatively by the pacer effect. */}
            <div ref={pacerLineRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 w-[3px] rounded-full bg-error/90 will-change-transform" style={{ display: 'none', height: 0, transform: 'translate(-9999px, 0)' }} />
            {/* Shown instead when the pacer has scrolled above the view: an up-caret that
                tracks its horizontal position along the top edge, so its location stays legible. */}
            <div ref={pacerAboveRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 text-[0.7rem] leading-none text-error will-change-transform" style={{ display: 'none', transform: 'translate(-9999px, 0)' }}>▲</div>
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
