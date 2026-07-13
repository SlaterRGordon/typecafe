import { useEffect, useRef, useState, type ReactNode } from "react"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes, type QuoteLength, type WordSize } from "../types"
import { TIMED_TEST_PRESETS, WORD_TEST_PRESETS } from "~/lib/testConfig"
import { ToolbarMenu } from "./ToolbarMenu"
import { composeLanguage, parseLanguage } from "../utils"
import { languageMeta } from "~/lib/languageMeta"

type ToolbarMode = {
    label: string
    mode: TestModes
    subMode?: TestSubModes
    defaultCount: number
}

type OpenMenu = "language" | "settings" | null

const TOOLBAR_MODES: ToolbarMode[] = [
    { label: "timed", mode: TestModes.normal, subMode: TestSubModes.timed, defaultCount: 15 },
    { label: "words", mode: TestModes.normal, subMode: TestSubModes.words, defaultCount: 10 },
    { label: "practice", mode: TestModes.practice, defaultCount: 10 },
    { label: "grams", mode: TestModes.ngrams, defaultCount: 10 },
]

const TIMED_LENGTHS: readonly number[] = TIMED_TEST_PRESETS
const WORD_LENGTHS: readonly number[] = WORD_TEST_PRESETS
const QUOTE_LENGTHS: { value: QuoteLength, label: string }[] = [
    { value: "all", label: "all" },
    { value: "short", label: "short" },
    { value: "medium", label: "medium" },
    { value: "long", label: "long" },
]

const GRAM_SOURCES: { value: TestGramSources, label: string }[] = [
    { value: TestGramSources.bigrams, label: "bigrams" },
    { value: TestGramSources.trigrams, label: "trigrams" },
    { value: TestGramSources.tetragrams, label: "tetragrams" },
    { value: TestGramSources.words, label: "words" },
]
const GRAM_SCOPES: TestGramScopes[] = [TestGramScopes.fifty, TestGramScopes.oneHundred, TestGramScopes.twoHundred]

// The base language is chosen in the nav; the bar picks a vocabulary size on top.
// English ships a curated 25k; other languages slice their frequency list and stop
// at 10k (see docs/features/global-language.md).
const SIZES: { value: WordSize, label: string }[] = [
    { value: "1k", label: "1k" },
    { value: "5k", label: "5k" },
    { value: "10k", label: "10k" },
    { value: "25k", label: "25k" },
]
const sizesFor = (base: string): { value: WordSize, label: string }[] =>
    base === "english" ? SIZES : SIZES.filter((size) => size.value !== "25k")

function languageLabelFor(language: string): string {
    const { base, size } = parseLanguage(language)
    return `${languageMeta(base).label} ${size}`
}

// The short form shown in the settings line ("en 1k", "fr 5k", "quotes").
function languageShortLabelFor(language: string): string {
    const { base, size } = parseLanguage(language)
    return `${languageMeta(base).short} ${size}`
}

interface ModeBarProps {
    mode: TestModes
    subMode: TestSubModes
    count: number
    customLength: boolean
    language: string
    quoteLength: QuoteLength
    selectedKeys: string[]
    gramSource: TestGramSources
    gramScope: TestGramScopes
    gramCombination: number
    gramRepetition: number
    gramWpmThreshold: number
    gramAccuracyThreshold: number
    punctuation: boolean
    capitals: boolean
    numbers: boolean
    fullscreen: boolean
    onSmartDrill: () => void
    setMode: (mode: TestModes) => void
    setSubMode: (subMode: TestSubModes) => void
    setCount: (count: number) => void
    setCustomLength: (value: boolean) => void
    setLanguage: (language: string) => void
    setQuoteLength: (value: QuoteLength) => void
    setGramSource: (value: TestGramSources) => void
    setGramScope: (value: TestGramScopes) => void
    setGramCombination: (value: number) => void
    setGramRepetition: (value: number) => void
    setGramWpmThreshold: (value: number) => void
    setGramAccuracyThreshold: (value: number) => void
    setPunctuation: (value: boolean) => void
    setCapitals: (value: boolean) => void
    setNumbers: (value: boolean) => void
    onRestart: () => void
    setFullscreen: (fullscreen: boolean) => void
}

function SvgSettings() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="1.5 1.5 13 13">
            <path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4ZM7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm3.618-3.602a.708.708 0 0 1-.824-.567l-.26-1.416a.354.354 0 0 0-.275-.282a6.072 6.072 0 0 0-2.519 0a.354.354 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.355.355 0 0 0-.382.095a5.99 5.99 0 0 0-1.262 2.173a.352.352 0 0 0 .108.378l1.102.931a.704.704 0 0 1 0 1.076l-1.102.931a.352.352 0 0 0-.108.378A5.986 5.986 0 0 0 3.53 12.02a.355.355 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.075 6.075 0 0 0 2.52 0a.353.353 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a5.99 5.99 0 0 0 1.262-2.173a.352.352 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.352.352 0 0 0 .108-.378A5.985 5.985 0 0 0 12.47 3.98a.355.355 0 0 0-.382-.095l-1.36.484a.71.71 0 0 1-.111.03Zm-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5.105 5.105 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977c.255.334.467.698.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a4.99 4.99 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5.099 5.099 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a4.987 4.987 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637a5.06 5.06 0 0 1 .63-1.084Z" />
        </svg>
    )
}

function SvgRestart() {
    return (
        // id="restart": Text.tsx blinks this icon as the test-over restart cue.
        <svg id="restart" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="0.8 1 22 22">
            <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                <path d="M12 3a9 9 0 1 1-5.657 2" />
                <path d="M3 4.5h4v4" />
            </g>
        </svg>
    )
}

function SvgFullscreen({ fullscreen }: { fullscreen: boolean }) {
    return fullscreen ? (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z" />
        </svg>
    )
}

// One plain-text option in a header line: pink when active, muted otherwise.
function TextOpt(props: {
    active?: boolean
    onClick: () => void
    children: ReactNode
    ariaLabel?: string
    title?: string
}) {
    return (
        <button
            type="button"
            aria-pressed={props.active ?? false}
            aria-label={props.ariaLabel}
            title={props.title}
            onClick={props.onClick}
            className={`cursor-pointer text-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.active ? "font-semibold text-primary" : "text-base-content/50 hover:text-base-content"}`}
        >
            {props.children}
        </button>
    )
}

function Sep() {
    return <span aria-hidden="true" className="text-base-content/20">|</span>
}

const iconButtonClass = "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-base-content/40 transition-colors hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

function SettingsToggle(props: { label: string, active: boolean, onChange: (active: boolean) => void }) {
    return (
        <button
            type="button"
            aria-pressed={props.active}
            onClick={() => props.onChange(!props.active)}
            className={`flex min-h-10 w-full items-center justify-between rounded-md border px-3 text-left text-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.active ? "border-primary/45 bg-primary/15 text-base-content" : "border-base-content/10 bg-base-100/25 text-base-content/65 hover:bg-base-content/5 hover:text-base-content"}`}
        >
            <span>{props.label}</span>
            <span className={`ml-3 rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide ${props.active ? "bg-primary text-primary-content" : "bg-base-content/10 text-base-content/55"}`}>
                {props.active ? "on" : "off"}
            </span>
        </button>
    )
}

// A dotted-underline click-to-edit number in the grams advanced line. Clicking
// swaps the text for a small input; commit on blur/Enter, cancel on Escape.
function InlineEdit(props: {
    id: string
    label: string
    value: number
    min: number
    max?: number
    display: string
    onCommit: (value: number) => void
}) {
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(String(props.value))
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editing) inputRef.current?.focus()
    }, [editing])

    const commit = () => {
        setEditing(false)
        const parsed = parseInt(text, 10)
        if (Number.isNaN(parsed)) return
        let next = Math.max(parsed, props.min)
        if (props.max !== undefined) next = Math.min(next, props.max)
        props.onCommit(next)
    }

    if (editing) {
        return (
            <input
                id={props.id}
                ref={inputRef}
                type="number"
                min={props.min}
                max={props.max}
                defaultValue={props.value}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") { setText(String(props.value)); setEditing(false) }
                }}
                className="h-5 w-14 rounded border border-primary/40 bg-base-200 px-1 text-center font-mono text-xs text-base-content outline-none"
                aria-label={props.label}
            />
        )
    }

    return (
        <button
            type="button"
            onClick={() => { setText(String(props.value)); setEditing(true) }}
            aria-label={`Edit ${props.label}`}
            title={`Edit ${props.label}`}
            className="cursor-pointer border-b border-dotted border-base-content/40 text-base-content/60 transition-colors hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
            {props.display}
        </button>
    )
}

export function ModeBar(props: ModeBarProps) {
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
    const [customText, setCustomText] = useState(String(props.count))
    // Whether the custom-length editor is expanded. Kept separate from
    // `customLength` (the persisted "a custom length is in effect" flag, which also
    // marks the test unranked) so committing/cancelling can collapse the editor
    // while a non-preset length stays active and the custom option stays lit.
    const [customOpen, setCustomOpen] = useState(false)

    const isNormal = props.mode === TestModes.normal
    const isQuotes = props.mode === TestModes.quotes
    const isPractice = props.mode === TestModes.practice
    const isGrams = props.mode === TestModes.ngrams
    // The "relaxed" engine backs the ∞ length option (no timer / infinite words),
    // which keeps the typist in Timed/Words.
    const isRelaxed = props.mode === TestModes.relaxed
    const showLengths = isNormal || isRelaxed
    const lengthPresets = props.subMode === TestSubModes.timed ? TIMED_LENGTHS : WORD_LENGTHS
    const lengthMax = props.subMode === TestSubModes.timed ? 3600 : 5000
    const { base: languageBase, size: wordSize } = parseLanguage(props.language)
    const languageLabel = isQuotes ? "Quotes" : languageLabelFor(props.language)
    const languageShort = isQuotes ? "quotes" : languageShortLabelFor(props.language)
    // The picker drives the text source for word-list modes (incl. the ∞ relaxed
    // engine) and Quotes; Grams and Practice generate their own text.
    const showLanguage = isNormal || isRelaxed || isQuotes
    // The gear holds the text add-ons; grams and quotes have none, so no gear.
    const showSettings = !isGrams && !isQuotes

    useEffect(() => {
        if (!props.customLength) setCustomText(String(props.count))
    }, [props.count, props.customLength])

    const isActive = (option: ToolbarMode) => {
        if (option.mode === TestModes.normal) {
            // Timed/Words stay lit under the ∞ relaxed engine too - ∞ is a length,
            // not a different mode.
            const inWordEngine = props.mode === TestModes.normal || props.mode === TestModes.relaxed
            return inWordEngine && props.subMode === option.subMode
        }
        return props.mode === option.mode
    }

    const handleModeChange = (next: ToolbarMode) => {
        props.setMode(next.mode)
        props.setCustomLength(false)
        setCustomOpen(false)
        props.setCount(next.defaultCount)
        setOpenMenu(null)

        if (next.mode === TestModes.normal && next.subMode !== undefined) {
            props.setSubMode(next.subMode)
        } else {
            props.setSubMode(TestSubModes.words)
        }
    }

    const handleSelectLength = (value: number) => {
        // Picking a finite length leaves the ∞ relaxed engine and returns to Normal
        // on the current sub-mode (no-op when already Normal).
        props.setMode(TestModes.normal)
        props.setCustomLength(false)
        setCustomOpen(false)
        props.setCount(value)
    }

    const handleSelectCustom = () => {
        props.setMode(TestModes.normal)
        setCustomText(String(props.count))
        props.setCustomLength(true)
        setCustomOpen(true)
    }

    // ∞: no timer (Timed) / infinite words (Words). Both run the relaxed engine -
    // text scrolls forever and the test never auto-completes (free-typing / warmup).
    const handleSelectInfinite = () => {
        props.setMode(TestModes.relaxed)
        props.setCustomLength(false)
        setCustomOpen(false)
    }

    // The bar picks the vocabulary size for the active (nav-chosen) language, and
    // doubles as a text-source picker: choosing a size leaves the quote engine for
    // Normal; "Quotes" enters it. Size composes onto the base language string.
    const selectSize = (size: WordSize) => {
        if (isQuotes) props.setMode(TestModes.normal)
        props.setLanguage(composeLanguage(languageBase, size))
        setOpenMenu(null)
    }

    const selectQuotes = () => {
        props.setMode(TestModes.quotes)
        setOpenMenu(null)
    }

    const commitCustomLength = () => {
        const parsed = parseInt(customText, 10)
        const normalized = Number.isNaN(parsed) ? props.count : Math.min(Math.max(parsed, 1), lengthMax)
        props.setCount(normalized)
        setCustomText(String(normalized))
        // A value that lands on a preset is no longer "custom" (becomes ranked).
        props.setCustomLength(!lengthPresets.includes(normalized))
        setCustomOpen(false)
    }

    // Hand focus back to the hidden typing input so the user can start typing
    // immediately after configuring a length.
    const focusTyperInput = () => {
        if (typeof document === "undefined") return
        ;(document.getElementById("input") as HTMLInputElement | null)?.focus()
    }

    const cancelCustomLength = () => {
        setCustomText(String(props.count))
        props.setCustomLength(!lengthPresets.includes(props.count))
        setCustomOpen(false)
        focusTyperInput()
    }

    const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
        setOpenMenu((current) => current === menu ? null : menu)
    }

    return (
        <div
            data-testid="typer-toolbar"
            aria-label="Typing toolbar"
            className="relative z-40 mx-auto mb-12 flex w-full max-w-screen-xl flex-col items-center gap-2.5"
        >
            {/* Mode line: plain-text mode names, active one pink. */}
            <div data-testid="mode-bar" aria-label="Typing mode" className="flex items-center gap-4">
                {TOOLBAR_MODES.map((option) => (
                    <TextOpt key={option.label} active={isActive(option)} onClick={() => handleModeChange(option)}>
                        {option.label}
                    </TextOpt>
                ))}
            </div>

            {/* Settings line: the active mode's options as text segments, then the
                language + icon cluster. */}
            <div data-testid="toolbar-context" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {showLengths && !customOpen &&
                    <>
                        {lengthPresets.map((length) => (
                            <TextOpt
                                key={length}
                                active={isNormal && props.count === length && !props.customLength}
                                onClick={() => handleSelectLength(length)}
                            >
                                {length}
                            </TextOpt>
                        ))}
                        <TextOpt
                            active={isRelaxed}
                            onClick={handleSelectInfinite}
                            ariaLabel={props.subMode === TestSubModes.timed ? "No timer" : "Infinite words"}
                            title={props.subMode === TestSubModes.timed ? "No timer" : "Infinite words"}
                        >
                            ∞
                        </TextOpt>
                        <TextOpt active={props.customLength} onClick={handleSelectCustom}>
                            custom
                        </TextOpt>
                    </>
                }

                {showLengths &&
                    <span
                        data-testid="custom-length-panel"
                        aria-hidden={!customOpen}
                        className={customOpen ? "inline-flex items-center gap-1.5 rounded border border-primary/35 bg-base-200 px-2 py-0.5" : "hidden"}
                    >
                        <input
                            id="customLengthInput"
                            type="number"
                            min={1}
                            max={lengthMax}
                            tabIndex={customOpen ? 0 : -1}
                            value={customText}
                            onChange={(event) => setCustomText(event.target.value)}
                            onBlur={commitCustomLength}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur()
                                    focusTyperInput()
                                }
                                if (event.key === "Escape") cancelCustomLength()
                            }}
                            className="h-5 w-16 bg-transparent font-mono text-md text-base-content outline-none"
                            aria-label={props.subMode === TestSubModes.timed ? "Custom timed length" : "Custom word length"}
                        />
                        <span className="shrink-0 text-xs font-medium text-base-content/45">{props.subMode === TestSubModes.timed ? "sec" : "words"}</span>
                        <button
                            type="button"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-base-content/55 transition hover:text-base-content"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={cancelCustomLength}
                            aria-label="Cancel custom length"
                            title="Cancel custom length"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </span>
                }

                {isQuotes &&
                    <span data-testid="quote-length-bar" aria-label="Quote length" className="inline-flex items-center gap-3">
                        {QUOTE_LENGTHS.map((option) => (
                            <TextOpt
                                key={option.value}
                                active={props.quoteLength === option.value}
                                onClick={() => props.setQuoteLength(option.value)}
                            >
                                {option.label}
                            </TextOpt>
                        ))}
                    </span>
                }

                {isPractice &&
                    <>
                        <TextOpt
                            onClick={props.onSmartDrill}
                            ariaLabel="Drill your eight least accurate keys"
                            title="Drill your eight least accurate keys"
                        >
                            ⌖ smart drill
                        </TextOpt>
                        <Sep />
                        <span data-testid="practice-active-count" className="text-xs text-base-content/40">
                            {props.selectedKeys.length} keys active
                        </span>
                    </>
                }

                {isGrams &&
                    <>
                        {GRAM_SOURCES.map((option) => (
                            <TextOpt key={option.value} active={props.gramSource === option.value} onClick={() => props.setGramSource(option.value)}>
                                {option.label}
                            </TextOpt>
                        ))}
                        <Sep />
                        {GRAM_SCOPES.map((scope) => (
                            <TextOpt key={scope} active={props.gramScope === scope} onClick={() => props.setGramScope(scope)}>
                                {scope === TestGramScopes.fifty ? "top 50" : String(scope)}
                            </TextOpt>
                        ))}
                    </>
                }

                {showLanguage &&
                    <>
                        <Sep />
                        <ToolbarMenu
                            open={openMenu === "language"}
                            onClose={() => setOpenMenu(null)}
                            testId="language-menu"
                            widthClassName="w-52"
                            trigger={
                                <TextOpt
                                    active={false}
                                    onClick={() => toggleMenu("language")}
                                    ariaLabel={`Language: ${languageLabel}`}
                                    title={`Language: ${languageLabel}`}
                                >
                                    {languageShort}
                                </TextOpt>
                            }
                        >
                            <div id="language-menu" className="space-y-1">
                                {/* Vocabulary size for the active language (chosen in the nav globe
                                    menu). The size row is "active" outside the quote engine. */}
                                <div className={`rounded-md px-3 py-2 ${!isQuotes ? "bg-primary/10" : ""}`}>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-md ${!isQuotes ? "text-primary" : "text-base-content/75"}`}>{languageMeta(languageBase).label}</span>
                                        {!isQuotes &&
                                            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Active</span>
                                        }
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {sizesFor(languageBase).map((size) => (
                                            <button
                                                key={size.value}
                                                type="button"
                                                className={`min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${wordSize === size.value && !isQuotes ? "bg-primary text-primary-content" : "bg-base-content/10 text-base-content/75 hover:bg-base-content/20"}`}
                                                aria-label={`${languageMeta(languageBase).label} ${size.label}`}
                                                aria-pressed={wordSize === size.value && !isQuotes}
                                                onClick={() => selectSize(size.value)}
                                            >
                                                {size.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Quotes: English-only verbatim prose - hidden for other languages. */}
                                {languageBase === "english" &&
                                    <button
                                        type="button"
                                        className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md px-3 text-left text-md transition-colors hover:bg-base-content/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isQuotes ? "bg-primary/10 text-primary" : "text-base-content/75"}`}
                                        aria-pressed={isQuotes}
                                        onClick={selectQuotes}
                                    >
                                        <span>Quotes</span>
                                        {isQuotes &&
                                            <span className="text-xs font-semibold uppercase tracking-wide">Active</span>
                                        }
                                    </button>
                                }
                            </div>
                        </ToolbarMenu>
                    </>
                }

                <Sep />

                {showSettings &&
                    <ToolbarMenu
                        open={openMenu === "settings"}
                        onClose={() => setOpenMenu(null)}
                        testId="settings-menu"
                        widthClassName="w-64"
                        trigger={
                            <button
                                type="button"
                                className={iconButtonClass}
                                aria-label="Open typing settings"
                                title="Open typing settings"
                                aria-expanded={openMenu === "settings"}
                                aria-controls="settings-menu"
                                onClick={() => toggleMenu("settings")}
                            >
                                <SvgSettings />
                            </button>
                        }
                    >
                        <div id="settings-menu" className="space-y-2">
                            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">Text</p>
                            {/* In Practice the toggle gates the locked mark keys: off strips
                                punctuation, on sprinkles the locked marks. */}
                            <SettingsToggle label="punctuation" active={props.punctuation} onChange={props.setPunctuation} />
                            <SettingsToggle label="capitals" active={props.capitals} onChange={props.setCapitals} />
                            <SettingsToggle label="numbers" active={props.numbers} onChange={props.setNumbers} />
                        </div>
                    </ToolbarMenu>
                }

                <button type="button" className={iconButtonClass} onClick={props.onRestart} aria-label="Restart test" title="Restart test">
                    <SvgRestart />
                </button>

                <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => props.setFullscreen(!props.fullscreen)}
                    aria-label={props.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    title={props.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                    <SvgFullscreen fullscreen={props.fullscreen} />
                </button>
            </div>

            {/* Grams advanced line: the numeric knobs as dotted-underline inline edits. */}
            {isGrams &&
                <div data-testid="grams-panel" aria-label="Grams settings" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-base-content/45">
                    <span>
                        <InlineEdit
                            id="testGramCombinationInput"
                            label="combinations (grams shown per level)"
                            value={props.gramCombination}
                            min={1}
                            max={props.gramScope}
                            display={`${props.gramCombination} combo`}
                            onCommit={props.setGramCombination}
                        />
                    </span>
                    <span>
                        <InlineEdit
                            id="testGramRepetitionInput"
                            label="repetitions (times each level repeats)"
                            value={props.gramRepetition}
                            min={0}
                            display={`×${props.gramRepetition} reps`}
                            onCommit={props.setGramRepetition}
                        />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        advance at
                        <InlineEdit
                            id="testGramWpmThresholdInput"
                            label="WPM needed to advance"
                            value={props.gramWpmThreshold}
                            min={0}
                            display={`${props.gramWpmThreshold} wpm`}
                            onCommit={props.setGramWpmThreshold}
                        />
                        ·
                        <InlineEdit
                            id="testGramAccuracyThresholdInput"
                            label="accuracy needed to advance"
                            value={props.gramAccuracyThreshold}
                            min={0}
                            max={100}
                            display={`${props.gramAccuracyThreshold}%`}
                            onCommit={props.setGramAccuracyThreshold}
                        />
                    </span>
                </div>
            }
        </div>
    )
}
