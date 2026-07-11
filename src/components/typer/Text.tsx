import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { applyTextOptions, generateBetterPseudoText, generateText, parseLanguage } from "./utils"
import { ALL_DIGITS } from "~/lib/drillKeys"
import { TestModes, TestSubModes } from "./types"
import { isAnyModalOpen, isModalOpen, MODAL_IDS } from "~/lib/modals"
import { runWhenIdle } from "~/lib/idle"

interface TextProps {
    text: string,
    started: boolean,
    restarted: boolean,
    // The mode's counter row (countdown / word count), rendered inside the same
    // shrink-wrapped block as the words so it follows the text: a full line keeps
    // it at the text's left origin, a shorter-than-one-line prompt carries it along
    // to the center.
    counter?: ReactNode,
    // Increments on every restart; forces the reset effect to re-run even when the
    // regenerated text is byte-identical (e.g. a grams level's deterministic gram).
    restartNonce?: number,
    modalOpen: boolean,
    language: string,
    mode: TestModes,
    subMode: TestSubModes,
    punctuation?: boolean,
    capitals?: boolean,
    numbers?: boolean,
    // Challenge runs use fixed seeded text; never append generated words (which
    // would break the byte-identical-across-clients guarantee).
    noAppend?: boolean,
    // Boss levels: a pacer line glides across the text at this net WPM. If it
    // catches the typist's cursor the run ends early (overtake = death).
    pacerWpm?: number,
    onPacerCaught?: () => void,
    // No-miss levels: the first incorrect keystroke ends the run.
    failOnMiss?: boolean,
    // When a level supplies its keys, timed/relaxed appends are built from those
    // keys (a speed round stays on the level's keys) rather than full language.
    appendKeys?: string,
    charAttempts: Map<string, { attempts: number, correct: number }>
    onStart: () => void,
    onComplete: () => void,
    onKeyChange: (key: string) => void,
    onCharacterAttempt?: (attempt: { expected: string, typed: string, correct: boolean }) => void,
    onBackspace?: () => void,
}

// True for editable form controls. The toolbar and its subpanels live inside
// #typer, so their inputs would otherwise have focus yanked back to the hidden
// typing input on click/keystroke/restart - making them un-editable.
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
        counter,
        restartNonce,
        modalOpen,
        language,
        mode,
        subMode,
        punctuation = false,
        capitals = false,
        numbers = false,
        noAppend = false,
        pacerWpm,
        onPacerCaught,
        failOnMiss,
        appendKeys,
        charAttempts,
        onStart,
        onComplete,
        onKeyChange,
        onCharacterAttempt,
        onBackspace,
    } = props
    // Ref-only, no state: a keystroke must never re-render this component
    // (typing-feel §1). All per-key work happens imperatively in
    // nextLetter/prevLetter; React only re-renders on restart/config changes.
    const positionRef = useRef(0)
    // The span the cursor sits on. Char spans are ordered siblings, so the
    // cursor walks nextElementSibling/previousElementSibling - no per-keystroke
    // querySelector over the (append-grown) container.
    const activeCharRef = useRef<HTMLElement | null>(null)
    const textContainerRef = useRef<HTMLDivElement>(null)
    const charStatesRef = useRef<Map<number, 'correct' | 'incorrect'>>(new Map())
    const currentTextRef = useRef(text)
    const isAppendingRef = useRef(false)
    const completedRef = useRef(false)
    const callbacksRef = useRef({ onKeyChange })
    const [loadingText, setLoadingText] = useState(true)

    // ref div to scroll text
    const typerRef = useRef<HTMLDivElement>(null)

    // The vertical caret (typing-feel §2): an absolutely positioned line moved
    // with transform, same imperative pattern as the pacer. A short CSS
    // transform transition makes it glide between letters; the caret-idle
    // class (re-added after a typing pause) makes it blink.
    const caretRef = useRef<HTMLDivElement>(null)
    const caretIdleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // ref input to focus
    const inputRef = useRef<HTMLInputElement>(null)

    // Place the caret at the active char's left edge - or the right edge of the
    // last char when the text is fully consumed. Coordinates mirror the pacer's:
    // offsets are relative to #text, minus the words-container scroll.
    const positionCaret = useCallback(() => {
        const caret = caretRef.current
        const words = typerRef.current
        if (!caret || !words) return
        const active = activeCharRef.current
        const anchor = active ?? (textContainerRef.current?.lastElementChild as HTMLElement | null)
        if (!anchor) {
            caret.style.display = 'none'
            return
        }
        const x = (active ? anchor.offsetLeft : anchor.offsetLeft + anchor.offsetWidth) - 1
        const y = anchor.offsetTop - words.scrollTop
        // Mid-scroll the anchor's line can sit outside the words viewport; hide
        // rather than paint a caret over the counter row or below the fold.
        if (y < words.offsetTop - 2 || y > words.offsetTop + words.clientHeight) {
            caret.style.display = 'none'
            return
        }
        caret.style.display = 'block'
        caret.style.height = `${anchor.offsetHeight}px`
        caret.style.transform = `translate(${x}px, ${y}px)`
    }, [])

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
        // to the hidden typing input on every click/keystroke - making them
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
        appendEpochRef.current++
        setLoadingText(text.length === 0)
        renderInitialText(text)
        positionRef.current = 0
        activeCharRef.current = (textContainerRef.current?.firstElementChild as HTMLElement | null) ?? null
        if (typerRef.current) typerRef.current.scrollTop = 0
        // Fresh test: caret on the first char, blinking immediately (idle).
        positionCaret()
        clearTimeout(caretIdleTimerRef.current)
        caretRef.current?.classList.add('caret-idle')
        callbacksRef.current.onKeyChange(text[0] ?? '')

        const restartBtn = document.getElementById("restart") as HTMLButtonElement
        if (restartBtn) restartBtn.classList.remove("blinking", "text-primary")
        const input = inputRef.current
        // A config change (e.g. editing a grams-subpanel field) regenerates text
        // and lands here; don't yank focus away from a control the user is editing.
        const active = document.activeElement
        if (input && !modalOpen && (active === input || !isEditableElement(active))) input.focus({ preventScroll: true })
    }, [modalOpen, positionCaret, renderInitialText, restarted, text, restartNonce])

    // Append new text when needed. Relaxed mode scrolls forever; timed tests must
    // also never run out of text - a fast typist on a long custom duration would
    // otherwise exhaust the buffer and deadlock until the timer expires.
    const appendsText = !noAppend && (mode === TestModes.relaxed ||
        (mode === TestModes.normal && subMode === TestSubModes.timed))
    // Latest append inputs, readable from the idle callback without re-wiring
    // it on every option change.
    const appendConfigRef = useRef({ appendsText, appendKeys, language, punctuation, capitals, numbers })
    appendConfigRef.current = { appendsText, appendKeys, language, punctuation, capitals, numbers }
    // Bumped on restart so a scheduled append can't land on a regenerated test.
    const appendEpochRef = useRef(0)

    // Refill the buffer off the keystroke's critical path: generation + the DOM
    // append of ~600 spans run in an idle callback. The 300-char threshold gives
    // seconds of margin at any human speed, so the 1s timeout always lands in time.
    const scheduleAppendIfNeeded = () => {
        const config = appendConfigRef.current
        if (!config.appendsText || isAppendingRef.current) return
        if (positionRef.current < currentTextRef.current.length - 300) return
        isAppendingRef.current = true
        const epoch = appendEpochRef.current
        const run = () => {
            isAppendingRef.current = false
            if (epoch !== appendEpochRef.current) return
            const current = appendConfigRef.current
            if (!current.appendsText) return
            const generated = current.appendKeys
                ? generateBetterPseudoText(100, current.appendKeys.split(""), parseLanguage(current.language).base)
                : generateText(100, current.language)
            const newText = applyTextOptions(generated, current.punctuation, current.capitals, { digits: current.numbers ? ALL_DIGITS : [] })
            appendNewText(" " + newText)
            currentTextRef.current += " " + newText
        }
        runWhenIdle(run)
    }

    useEffect(() => {
        if (!started && !restarted) {
            const current = typerRef.current?.querySelector("#c" + positionRef.current.toString()) as HTMLDivElement
            const restartBtn = document.getElementById("restart") as HTMLButtonElement
            if (restartBtn) restartBtn.classList.add("blinking", "text-primary")
            if (current) current.classList.value = ""
            // The attempt is over; the frozen text shows no cursor.
            if (caretRef.current) caretRef.current.style.display = 'none'
            clearTimeout(caretIdleTimerRef.current)
        }
    }, [started, restarted])

    // Typing keeps the caret solid; a pause brings the blink back.
    const wakeCaret = useCallback(() => {
        caretRef.current?.classList.remove('caret-idle')
        clearTimeout(caretIdleTimerRef.current)
        caretIdleTimerRef.current = setTimeout(() => caretRef.current?.classList.add('caret-idle'), 600)
    }, [])

    // Follow the smooth line-change scroll (and window resizes) so the caret
    // rides with the text instead of teleporting after it settles.
    useEffect(() => {
        const words = typerRef.current
        if (!words) return
        const reposition = () => positionCaret()
        words.addEventListener('scroll', reposition, { passive: true })
        window.addEventListener('resize', reposition)
        return () => {
            words.removeEventListener('scroll', reposition)
            window.removeEventListener('resize', reposition)
            clearTimeout(caretIdleTimerRef.current)
        }
    }, [positionCaret])

    // Post-keystroke cursor work, imperative (no render): follow the cursor's
    // line and report the new expected key. `activeChar` already carries the
    // active-char class; this only scrolls and notifies.
    const afterCursorMove = (activeChar: Element | null) => {
        const words = typerRef.current
        const char = activeChar as HTMLElement | null
        if (char && words) {
            // scroll typer if new line
            const offset = char.offsetTop - words.offsetTop
            if (offset !== words.scrollTop) {
                words.scrollBy(0, offset - words.scrollTop)
            }
        }
        positionCaret()
        wakeCaret()
        callbacksRef.current.onKeyChange(char?.textContent ?? '')
    }

    // First keystroke: start the clock the pacer races against, then the timer.
    const startAttempt = () => {
        pacerStartRef.current = performance.now()
        onStart()
    }

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (completedRef.current) return

        const currentPosition = positionRef.current
        const current = activeCharRef.current

        if (current && restarted) {
            // textContent, never innerText: innerText is layout-aware and forces
            // a synchronous reflow on the hottest path in the app.
            const expected = (current.textContent ?? '').trim()
            // check for correct key or incorrect
            if ((expected === '' && e.key === ' ') || expected === e.key) {
                nextLetter(true, e.key)
                // start timer
                if (currentPosition === 0 && !started) startAttempt()
            } else if (e.code == 'Space' || e.key.length == 1) {
                // Any single printable key (letter, capital, punctuation, symbol) that
                // does not match the expected character counts as an incorrect attempt -
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
        const currentChar = activeCharRef.current

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

            positionRef.current = currentIndex + 1

            // No-miss levels end on the first error - the recorded miss makes the
            // completion grade as a fail (accuracy < 100).
            if (!correct && failOnMiss && !completedRef.current) {
                completedRef.current = true
                onComplete()
                return
            }

            // Check if test is complete
            if (currentIndex === currentTextRef.current.length - 1) {
                completedRef.current = true
                onComplete()
            }

            // Update active character styling for new position
            const nextChar = currentChar.nextElementSibling as HTMLElement | null
            activeCharRef.current = nextChar
            if (nextChar) {
                nextChar.classList.add('active-char', 'text-primary')
            }
            afterCursorMove(nextChar)
            scheduleAppendIfNeeded()
        }
    }

    const prevLetter = () => {
        const currentPosition = positionRef.current
        if (currentPosition === 0) return

        const prevIndex = currentPosition - 1
        const currentChar = activeCharRef.current
        // At the end of the text there is no active span; step back from the last one.
        const prevChar = (currentChar
            ? currentChar.previousElementSibling
            : textContainerRef.current?.lastElementChild) as HTMLElement | null
        currentChar?.classList.remove('active-char', 'text-primary')

        if (prevChar) {
            // Reset DOM styling
            prevChar.classList.remove('text-base-300', 'text-secondary', 'underline')

            // Update state tracking
            charStatesRef.current.delete(prevIndex)

            positionRef.current = prevIndex
            // The recorder owns the net character/incorrect counts; tell it a
            // committed key was walked back.
            onBackspace?.()

            // Update active character styling
            activeCharRef.current = prevChar
            prevChar.classList.add('active-char', 'text-primary')
            afterCursorMove(prevChar)
        }
    }

    // Boss pacer: a vertical line glides across the text at pacerWpm. It advances
    // on a continuous clock (rAF), interpolating between character boxes so it
    // slides smoothly rather than jumping per character. If it consumes as many
    // characters as the typist has (it reached the cursor), the run ends -
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
                // Offsets are relative to #text; the words' own top edge (below the
                // counter slot) is where "scrolled off the top" begins.
                const wordsTop = words.offsetTop
                // When the typist races ahead, the pacer's line scrolls off the top
                // and clips. Rather than lose it, show an up-caret riding the words'
                // top edge at the pacer's horizontal position, so where it is stays legible.
                if (y < wordsTop) {
                    line.style.display = 'none'
                    if (above) {
                        above.style.display = 'block'
                        above.style.transform = `translate(${x - 4}px, ${wordsTop}px)`
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
        <div id="text" className={`relative z-30 mb-8 flex w-full max-w-[calc(100vw-2rem)] flex-col md:max-w-screen-xl ${mode === TestModes.ngrams && text.length <= 8 ? "text-[40px] leading-[4.4rem] tracking-wide sm:text-[60px] sm:leading-[6rem]" : "text-[24px] leading-[2.2rem] sm:text-[34px] sm:leading-[3rem]"}`}>
            <input id="input" autoCapitalize="none" autoComplete="off" className="h-0 p-0 m-0 border-none" onKeyDown={handleKeyPress} ref={inputRef} autoFocus />
            {/* The typing caret - positioned imperatively per keystroke (typing-feel §2). */}
            <div ref={caretRef} data-testid="typing-caret" aria-hidden="true" className="typing-caret caret-idle pointer-events-none absolute left-0 top-0 z-40 w-[2.5px] rounded-full bg-primary will-change-transform" style={{ display: 'none', height: 0, transform: 'translate(-9999px, 0)' }} />
            {/* Boss pacer line - positioned and animated imperatively by the pacer effect. */}
            <div ref={pacerLineRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 w-[3px] rounded-full bg-error/90 will-change-transform" style={{ display: 'none', height: 0, transform: 'translate(-9999px, 0)' }} />
            {/* Shown instead when the pacer has scrolled above the view: an up-caret that
                tracks its horizontal position along the words' top edge, so its location stays legible. */}
            <div ref={pacerAboveRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 text-[0.7rem] leading-none text-error will-change-transform" style={{ display: 'none', transform: 'translate(-9999px, 0)' }}>▲</div>
            {/* The shrink-wrapped block: a shorter-than-one-line text sizes to content
                width and centers, carrying the counter with it; longer text clamps to
                max-w-full and reads left-aligned with the counter at its origin. */}
            <div className="flex w-full justify-center">
                <div className="flex min-w-0 max-w-full flex-col">
                    {counter}
                    <div className="flex w-full max-h-[6.6rem] flex-wrap overflow-y-hidden no-scrollbar scroll-smooth font-mono select-none sm:max-h-[9rem]" id="words" ref={typerRef}>
                        <div
                            className="max-w-full"
                            ref={textContainerRef}
                        />
                        {loadingText && <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>}
                    </div>
                </div>
            </div>
        </div>
    )
})
