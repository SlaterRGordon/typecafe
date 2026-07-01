import { useEffect, useState, type ReactNode } from "react"
import { TestGramScopes, TestGramSources, TestModes, TestSubModes, type QuoteLength } from "../types"
import { ToolbarMenu } from "./ToolbarMenu"
import { GramsPanel } from "./GramsPanel"

type ToolbarMode = {
    label: string
    mode: TestModes
    subMode?: TestSubModes
    defaultCount: number
}

type OpenMenu = "language" | "settings" | null

const TOOLBAR_MODES: ToolbarMode[] = [
    { label: "Timed", mode: TestModes.normal, subMode: TestSubModes.timed, defaultCount: 15 },
    { label: "Words", mode: TestModes.normal, subMode: TestSubModes.words, defaultCount: 10 },
    { label: "Practice", mode: TestModes.practice, defaultCount: 10 },
    { label: "Grams", mode: TestModes.ngrams, defaultCount: 10 },
]

const TIMED_LENGTHS = [15, 30, 60, 120]
const WORD_LENGTHS = [10, 25, 50, 100]
const QUOTE_LENGTHS: { value: QuoteLength, label: string }[] = [
    { value: "all", label: "All" },
    { value: "short", label: "Short" },
    { value: "medium", label: "Medium" },
    { value: "long", label: "Long" },
]

// English ships as vocabulary-size slices of the unigram frequency corpus. "1k"
// is the curated default and maps to the base `english` key; the rest load on
// demand. They're grouped under one English row in the picker.
const ENGLISH_SIZES = [
    { value: "english", label: "1k" },
    { value: "english5k", label: "5k" },
    { value: "english10k", label: "10k" },
    { value: "english25k", label: "25k" },
]
const ENGLISH_VALUES = new Set(ENGLISH_SIZES.map((size) => size.value))

const OTHER_LANGUAGES = [
    { value: "french", label: "French" },
    { value: "spanish", label: "Spanish" },
]

function languageLabelFor(language: string): string {
    const size = ENGLISH_SIZES.find((option) => option.value === language)
    if (size) return `English ${size.label}`
    return OTHER_LANGUAGES.find((option) => option.value === language)?.label ?? language
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
    showStats: boolean
    showKeyboard: boolean
    fullscreen: boolean
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
    setShowStats: (show: boolean) => void
    setShowKeyboard: (show: boolean) => void
    onRestart: () => void
    setFullscreen: (fullscreen: boolean) => void
}

function SvgSettings() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="1.5 1.5 13 13">
            <path fill="currentColor" d="M8 6a2 2 0 1 0 0 4a2 2 0 0 0 0-4ZM7 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm3.618-3.602a.708.708 0 0 1-.824-.567l-.26-1.416a.354.354 0 0 0-.275-.282a6.072 6.072 0 0 0-2.519 0a.354.354 0 0 0-.275.282l-.259 1.416a.71.71 0 0 1-.936.538l-1.359-.484a.355.355 0 0 0-.382.095a5.99 5.99 0 0 0-1.262 2.173a.352.352 0 0 0 .108.378l1.102.931a.704.704 0 0 1 0 1.076l-1.102.931a.352.352 0 0 0-.108.378A5.986 5.986 0 0 0 3.53 12.02a.355.355 0 0 0 .382.095l1.36-.484a.708.708 0 0 1 .936.538l.258 1.416c.026.14.135.252.275.281a6.075 6.075 0 0 0 2.52 0a.353.353 0 0 0 .274-.281l.26-1.416a.71.71 0 0 1 .936-.538l1.359.484c.135.048.286.01.382-.095a5.99 5.99 0 0 0 1.262-2.173a.352.352 0 0 0-.108-.378l-1.102-.931a.703.703 0 0 1 0-1.076l1.102-.931a.352.352 0 0 0 .108-.378A5.985 5.985 0 0 0 12.47 3.98a.355.355 0 0 0-.382-.095l-1.36.484a.71.71 0 0 1-.111.03Zm-6.62.58l.937.333a1.71 1.71 0 0 0 2.255-1.3l.177-.97a5.105 5.105 0 0 1 1.265 0l.178.97a1.708 1.708 0 0 0 2.255 1.3L12 4.977c.255.334.467.698.63 1.084l-.754.637a1.704 1.704 0 0 0 0 2.604l.755.637a4.99 4.99 0 0 1-.63 1.084l-.937-.334a1.71 1.71 0 0 0-2.255 1.3l-.178.97a5.099 5.099 0 0 1-1.265 0l-.177-.97a1.708 1.708 0 0 0-2.255-1.3L4 11.023a4.987 4.987 0 0 1-.63-1.084l.754-.638a1.704 1.704 0 0 0 0-2.603l-.755-.637a5.06 5.06 0 0 1 .63-1.084Z" />
        </svg>
    )
}

function SvgRestart() {
    return (
        <svg id="restart" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="0.8 1 22 22">
            <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                <path d="M12 3a9 9 0 1 1-5.657 2" />
                <path d="M3 4.5h4v4" />
            </g>
        </svg>
    )
}

function SvgFullscreen({ fullscreen }: { fullscreen: boolean }) {
    return fullscreen ? (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M240-120v-120H120v-80h200v200h-80Zm400 0v-200h200v80H720v120h-80ZM120-640v-80h120v-120h80v200H120Zm520 0v-200h80v120h120v80H640Z" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="15 -940 920 920" fill="currentColor">
            <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z" />
        </svg>
    )
}

function SvgGlobe() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9" />
            <path d="M12 3C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9" />
        </svg>
    )
}

const toolbarButtonClass = "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-base-content/80 transition-colors hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
// A bordered toolbar group: the mode+context cluster and the icon cluster are now
// two separate groups, justified to opposite ends of the toolbar row.
const toolbarGroupClass = "flex items-center gap-1 rounded-lg border border-base-content/15 bg-base-200/35 p-2 backdrop-blur"
const segmentClass = (active: boolean) => `min-h-10 flex-1 basis-0 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-none ${active ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`

function SettingsToggle(props: { label: string, active: boolean, onChange: (active: boolean) => void }) {
    return (
        <button
            type="button"
            aria-pressed={props.active}
            onClick={() => props.onChange(!props.active)}
            className={`flex min-h-10 items-center justify-between rounded-md border px-3 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.active ? "border-primary/45 bg-primary/15 text-base-content" : "border-base-content/10 bg-base-100/25 text-base-content/65 hover:bg-base-content/5 hover:text-base-content"}`}
        >
            <span>{props.label}</span>
            <span className={`ml-3 rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide ${props.active ? "bg-primary text-primary-content" : "bg-base-content/10 text-base-content/55"}`}>
                {props.active ? "on" : "off"}
            </span>
        </button>
    )
}

function SettingsSection(props: { label: string, children: ReactNode }) {
    return (
        <section className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-base-content/45">{props.label}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{props.children}</div>
        </section>
    )
}

export function ModeBar(props: ModeBarProps) {
    const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
    const [customText, setCustomText] = useState(String(props.count))
    // Whether the custom-length editor panel is expanded. Kept separate from
    // `customLength` (the persisted "a custom length is in effect" flag, which also
    // marks the test unranked) so committing/cancelling can collapse the editor
    // while a non-preset length stays active and the Custom button stays selected.
    const [customOpen, setCustomOpen] = useState(false)

    const isNormal = props.mode === TestModes.normal
    const isQuotes = props.mode === TestModes.quotes
    // The "relaxed" engine is no longer its own mode — it backs the ∞ length option
    // (no timer / infinite words), which keeps the typist in Timed/Words.
    const isRelaxed = props.mode === TestModes.relaxed
    const showLengths = isNormal || isRelaxed
    const lengthPresets = props.subMode === TestSubModes.timed ? TIMED_LENGTHS : WORD_LENGTHS
    const lengthMax = props.subMode === TestSubModes.timed ? 3600 : 5000
    // Quotes is now a text source in the language picker rather than a mode, so it
    // reads as the active "language" while the quote engine runs.
    const languageLabel = isQuotes ? "Quotes" : languageLabelFor(props.language)
    // The picker drives the text source for word-list modes (Timed/Words, incl. the
    // ∞ relaxed engine) and Quotes; Grams and Practice generate their own text.
    const showLanguage = isNormal || isRelaxed || isQuotes

    useEffect(() => {
        if (!props.customLength) setCustomText(String(props.count))
    }, [props.count, props.customLength])

    const isActive = (option: ToolbarMode) => {
        if (option.mode === TestModes.normal) {
            // Timed/Words stay highlighted under the ∞ relaxed engine too — ∞ is a
            // length, not a different mode, so the sub-mode chip mustn't go dark.
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

    // ∞: no timer (Timed) / infinite words (Words). Both run the relaxed engine —
    // text scrolls forever and the test never auto-completes (free-typing / warmup).
    const handleSelectInfinite = () => {
        props.setMode(TestModes.relaxed)
        props.setCustomLength(false)
        setCustomOpen(false)
    }

    // The language picker doubles as a text-source picker: a word-list language
    // leaves the quote engine for Normal; "Quotes" enters it. Quotes carry their
    // own verbatim prose (no length/timer), so picking it just flips the mode.
    const selectWordLanguage = (value: string) => {
        if (isQuotes) props.setMode(TestModes.normal)
        props.setLanguage(value)
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
    // immediately after configuring a length — the toolbar lives inside #typer but
    // its own form fields don't auto-return focus the way the buttons do.
    const focusTyperInput = () => {
        if (typeof document === "undefined") return
        ;(document.getElementById("input") as HTMLInputElement | null)?.focus()
    }

    const cancelCustomLength = () => {
        setCustomText(String(props.count))
        // Closing the editor leaves the current count in place; keep it marked
        // custom only when it isn't one of the presets.
        props.setCustomLength(!lengthPresets.includes(props.count))
        setCustomOpen(false)
        focusTyperInput()
    }

    // Only the local text updates while typing — committing `count` per keystroke
    // would restart the test on every digit, and the restart refocuses the hidden
    // typing input, stealing focus mid-edit. The value is committed on blur/Enter.
    const handleCustomChange = (value: string) => {
        setCustomText(value)
    }

    const toggleMenu = (menu: Exclude<OpenMenu, null>) => {
        setOpenMenu((current) => current === menu ? null : menu)
    }

    return (
        <div className="mx-auto mb-16 w-full max-w-screen-xl space-y-3">
        <div
            data-testid="typer-toolbar"
            aria-label="Typing toolbar"
            className="relative z-40 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        >
            {/* Left group: mode selector + the active mode's context controls. */}
            <div className={`${toolbarGroupClass} min-w-0 flex-col sm:flex-row sm:gap-3`}>
            <div data-testid="mode-bar" aria-label="Typing mode" className="flex w-full min-w-0 gap-1 sm:w-auto">
                {TOOLBAR_MODES.map((option) => {
                    const active = isActive(option)
                    return (
                        <button
                            key={option.label}
                            type="button"
                            aria-pressed={active}
                            onClick={() => handleModeChange(option)}
                            className={`min-h-10 flex-1 basis-0 truncate rounded-md px-2 text-center text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-none sm:px-4 ${active ? "bg-primary text-primary-content shadow-sm" : "text-base-content/70 hover:bg-base-content/5 hover:text-base-content"}`}
                        >
                            {option.label}
                        </button>
                    )
                })}
            </div>

            {(showLengths || isQuotes) &&
                <div className="hidden h-8 w-px shrink-0 bg-base-content/10 sm:block" />
            }

            {isQuotes &&
            <div data-testid="quote-length-bar" aria-label="Quote length" className="flex h-10 w-full min-w-0 items-center gap-1 sm:w-auto">
                {QUOTE_LENGTHS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={props.quoteLength === option.value}
                        onClick={() => props.setQuoteLength(option.value)}
                        className={segmentClass(props.quoteLength === option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            }

            {showLengths &&
            <div data-testid="toolbar-context" className="relative flex min-h-10 w-full min-w-0 items-center overflow-hidden rounded-md sm:w-auto">
                {showLengths &&
                    <div className="flex h-10 w-full items-center gap-1">
                        {lengthPresets.map((length) => (
                            <button
                                key={length}
                                type="button"
                                aria-pressed={isNormal && props.count === length && !props.customLength}
                                onClick={() => handleSelectLength(length)}
                                className={segmentClass(isNormal && props.count === length && !props.customLength)}
                            >
                                {length}
                            </button>
                        ))}
                        <button
                            type="button"
                            aria-pressed={isRelaxed}
                            onClick={handleSelectInfinite}
                            className={segmentClass(isRelaxed)}
                            aria-label={props.subMode === TestSubModes.timed ? "No timer" : "Infinite words"}
                            title={props.subMode === TestSubModes.timed ? "No timer" : "Infinite words"}
                        >
                            ∞
                        </button>
                        <button
                            type="button"
                            aria-pressed={props.customLength}
                            onClick={handleSelectCustom}
                            className={segmentClass(props.customLength)}
                        >
                            Custom
                        </button>
                    </div>
                }

                {showLengths &&
                    <div
                        data-testid="custom-length-panel"
                        aria-hidden={!customOpen}
                        className={`absolute inset-0 flex items-center gap-1 rounded-md border border-primary/35 bg-base-200 px-2 py-1 transition-transform duration-200 ease-out ${customOpen ? "translate-x-0" : "!border-none translate-x-full pointer-events-none"}`}
                    >
                        <input
                            id="customLengthInput"
                            type="number"
                            min={1}
                            max={lengthMax}
                            tabIndex={customOpen ? 0 : -1}
                            value={customText}
                            onChange={(event) => handleCustomChange(event.target.value)}
                            onBlur={commitCustomLength}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.currentTarget.blur()
                                    focusTyperInput()
                                }
                                if (event.key === "Escape") cancelCustomLength()
                            }}
                            className="h-8 min-w-0 flex-1 bg-transparent pl-2 pr-1 font-mono text-sm text-base-content outline-none"
                            aria-label={props.subMode === TestSubModes.timed ? "Custom timed length" : "Custom word length"}
                        />
                        <span className="shrink-0 text-xs font-medium text-base-content/45">{props.subMode === TestSubModes.timed ? "sec" : "words"}</span>
                        <div className="mx-1 h-5 w-px shrink-0 bg-base-content/15" />
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-base-content/55 transition hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={cancelCustomLength}
                            aria-label="Cancel custom length"
                            title="Cancel custom length"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                }

            </div>
            }
            </div>

            {/* Right group: icon controls, aligned to the typer's right edge. */}
            <div className={`${toolbarGroupClass} justify-end`}>
                {showLanguage &&
                <ToolbarMenu
                    open={openMenu === "language"}
                    onClose={() => setOpenMenu(null)}
                    testId="language-menu"
                    widthClassName="w-52"
                    trigger={
                        <button
                            type="button"
                            className={toolbarButtonClass}
                            aria-label={`Language: ${languageLabel}`}
                            title={`Language: ${languageLabel}`}
                            aria-expanded={openMenu === "language"}
                            aria-controls="language-menu"
                            onClick={() => toggleMenu("language")}
                        >
                            <SvgGlobe />
                        </button>
                    }
                >
                    <div id="language-menu" className="space-y-1">
                        {/* English groups its vocabulary sizes onto one row of chips. A
                            word language is only "active" outside the quote engine. */}
                        <div className={`rounded-md px-3 py-2 ${ENGLISH_VALUES.has(props.language) && !isQuotes ? "bg-primary/10" : ""}`}>
                            <div className="flex items-center justify-between">
                                <span className={`text-sm ${ENGLISH_VALUES.has(props.language) && !isQuotes ? "text-primary" : "text-base-content/75"}`}>English</span>
                                {ENGLISH_VALUES.has(props.language) && !isQuotes &&
                                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">Active</span>
                                }
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {ENGLISH_SIZES.map((size) => (
                                    <button
                                        key={size.value}
                                        type="button"
                                        className={`min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.language === size.value && !isQuotes ? "bg-primary text-primary-content" : "bg-base-content/10 text-base-content/75 hover:bg-base-content/20"}`}
                                        aria-label={`English ${size.label}`}
                                        aria-pressed={props.language === size.value && !isQuotes}
                                        onClick={() => selectWordLanguage(size.value)}
                                    >
                                        {size.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {OTHER_LANGUAGES.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md px-3 text-left text-sm transition-colors hover:bg-base-content/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.language === option.value && !isQuotes ? "bg-primary/10 text-primary" : "text-base-content/75"}`}
                                aria-pressed={props.language === option.value && !isQuotes}
                                onClick={() => selectWordLanguage(option.value)}
                            >
                                <span>{option.label}</span>
                                {props.language === option.value && !isQuotes &&
                                    <span className="text-xs font-semibold uppercase tracking-wide">Active</span>
                                }
                            </button>
                        ))}
                        {/* Quotes: a verbatim-prose text source, not a word language. */}
                        <button
                            type="button"
                            className={`flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md px-3 text-left text-sm transition-colors hover:bg-base-content/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isQuotes ? "bg-primary/10 text-primary" : "text-base-content/75"}`}
                            aria-pressed={isQuotes}
                            onClick={selectQuotes}
                        >
                            <span>Quotes</span>
                            {isQuotes &&
                                <span className="text-xs font-semibold uppercase tracking-wide">Active</span>
                            }
                        </button>
                    </div>
                </ToolbarMenu>
                }

                <ToolbarMenu
                    open={openMenu === "settings"}
                    onClose={() => setOpenMenu(null)}
                    testId="settings-menu"
                    widthClassName="w-72 sm:w-[22rem]"
                    trigger={
                        <button
                            type="button"
                            className={toolbarButtonClass}
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
                    <div id="settings-menu" className="space-y-4">
                        {props.mode !== TestModes.ngrams && props.mode !== TestModes.quotes &&
                            <SettingsSection label="Text">
                                {/* Practice punctuation is driven by which mark keys are locked, not
                                    a global toggle — so the toggle is hidden there. capitals stays
                                    as the single Capitalize add-on. */}
                                {props.mode !== TestModes.practice &&
                                    <SettingsToggle label="punctuation" active={props.punctuation} onChange={props.setPunctuation} />
                                }
                                <SettingsToggle label="capitals" active={props.capitals} onChange={props.setCapitals} />
                            </SettingsSection>
                        }
                        <SettingsSection label="Display">
                            <SettingsToggle label="Live stats" active={props.showStats} onChange={props.setShowStats} />
                            {props.mode !== TestModes.practice &&
                                <SettingsToggle label="Keyboard" active={props.showKeyboard} onChange={props.setShowKeyboard} />
                            }
                        </SettingsSection>
                    </div>
                </ToolbarMenu>

                <button type="button" className={toolbarButtonClass} onClick={props.onRestart} aria-label="Restart test" title="Restart test">
                    <SvgRestart />
                </button>

                <button
                    type="button"
                    className={toolbarButtonClass}
                    onClick={() => props.setFullscreen(!props.fullscreen)}
                    aria-label={props.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    title={props.fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                    <SvgFullscreen fullscreen={props.fullscreen} />
                </button>
            </div>
        </div>

        {props.mode === TestModes.ngrams &&
            <GramsPanel
                gramSource={props.gramSource}
                gramScope={props.gramScope}
                gramCombination={props.gramCombination}
                gramRepetition={props.gramRepetition}
                gramWpmThreshold={props.gramWpmThreshold}
                gramAccuracyThreshold={props.gramAccuracyThreshold}
                setGramSource={props.setGramSource}
                setGramScope={props.setGramScope}
                setGramCombination={props.setGramCombination}
                setGramRepetition={props.setGramRepetition}
                setGramWpmThreshold={props.setGramWpmThreshold}
                setGramAccuracyThreshold={props.setGramAccuracyThreshold}
            />
        }
        </div>
    )
}
