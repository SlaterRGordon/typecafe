import { useEffect, useState, type ReactNode } from "react"
import { TestGramScopes, TestGramSources } from "../types"

interface GramsPanelProps {
    gramSource: TestGramSources
    gramScope: TestGramScopes
    gramCombination: number
    gramRepetition: number
    gramWpmThreshold: number
    gramAccuracyThreshold: number
    setGramSource: (value: TestGramSources) => void
    setGramScope: (value: TestGramScopes) => void
    setGramCombination: (value: number) => void
    setGramRepetition: (value: number) => void
    setGramWpmThreshold: (value: number) => void
    setGramAccuracyThreshold: (value: number) => void
}

const SOURCE_OPTIONS: { value: TestGramSources, label: string }[] = [
    { value: TestGramSources.bigrams, label: "Bigrams" },
    { value: TestGramSources.trigrams, label: "Trigrams" },
    { value: TestGramSources.tetragrams, label: "Tetragrams" },
    { value: TestGramSources.words, label: "Words" },
]

const SCOPE_OPTIONS: TestGramScopes[] = [TestGramScopes.fifty, TestGramScopes.oneHundred, TestGramScopes.twoHundred]

// A connected segmented control: options sit flush against each other inside a
// shared bordered track, divided by hairlines. Unselected options keep a visible
// button surface so they read clearly as choices, not faint labels.
function Segmented(props: { children: ReactNode }) {
    return (
        <div className="inline-flex divide-x divide-base-content/15 overflow-hidden rounded-md border border-base-content/20">
            {props.children}
        </div>
    )
}

function Segment(props: { active: boolean, onClick: () => void, children: ReactNode }) {
    return (
        <button
            type="button"
            aria-pressed={props.active}
            onClick={props.onClick}
            className={`min-h-9 px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${props.active ? "bg-primary text-primary-content" : "bg-base-100/40 text-base-content/75 hover:bg-base-content/10 hover:text-base-content"}`}
        >
            {props.children}
        </button>
    )
}

// A setting: title/subtext sitting beside its control. Wraps (control under the
// label) only when the column is too narrow to keep them side by side.
function Field(props: { label: string, description: string, children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-base-content/55">{props.label}</p>
                <p className="text-[0.7rem] text-base-content/40">{props.description}</p>
            </div>
            {props.children}
        </div>
    )
}

// A numeric field that commits on blur/Enter (not per keystroke) so editing it
// doesn't restart the grams drill on every digit, and clamps to a valid range.
function NumberField(props: {
    id: string
    label: string
    description: string
    value: number
    min: number
    max?: number
    onCommit: (value: number) => void
}) {
    const [text, setText] = useState(String(props.value))

    useEffect(() => {
        setText(String(props.value))
    }, [props.value])

    const commit = () => {
        const parsed = parseInt(text, 10)
        if (Number.isNaN(parsed)) {
            setText(String(props.value))
            return
        }
        let next = Math.max(parsed, props.min)
        if (props.max !== undefined) next = Math.min(next, props.max)
        props.onCommit(next)
        setText(String(next))
    }

    return (
        <Field label={props.label} description={props.description}>
            <input
                id={props.id}
                type="number"
                min={props.min}
                max={props.max}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") setText(String(props.value))
                }}
                className="h-9 w-20 rounded-md border border-base-content/15 bg-base-100/40 px-2 font-mono text-sm text-base-content outline-none focus-visible:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/40"
            />
        </Field>
    )
}

// Phase 2.6: grams settings as an anchored subpanel (vision-grams.png). No custom
// length input — that control in the mockup is a hallucination.
export function GramsPanel(props: GramsPanelProps) {
    return (
        <div
            data-testid="grams-panel"
            aria-label="Grams settings"
            className="max-w-screen-xl rounded-lg border border-base-content/15 bg-base-200/35 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur sm:p-4"
        >
            {/* Source + Scope on one row; on mobile every setting stacks. */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                <Field label="Source" description="Where the grams come from">
                    <Segmented>
                        {SOURCE_OPTIONS.map((option) => (
                            <Segment key={option.value} active={props.gramSource === option.value} onClick={() => props.setGramSource(option.value)}>
                                {option.label}
                            </Segment>
                        ))}
                    </Segmented>
                </Field>
                <Field label="Scope" description="How many top grams to draw from">
                    <Segmented>
                        {SCOPE_OPTIONS.map((scope) => (
                            <Segment key={scope} active={props.gramScope === scope} onClick={() => props.setGramScope(scope)}>
                                Top {scope}
                            </Segment>
                        ))}
                    </Segmented>
                </Field>
            </div>

            {/* The fiddly numeric knobs default to sensible values; fold them behind a
                disclosure so the panel reads as the two meaningful choices above.
                Native <details> — no state, keyboard-accessible for free. */}
            <details data-testid="grams-advanced" className="group mt-4 border-t border-base-content/10 pt-4">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/55 marker:content-none [&::-webkit-details-marker]:hidden">
                    Advanced
                    <svg className="h-4 w-4 transition-transform group-open:rotate-180" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5l5-5H7Z" /></svg>
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                    <NumberField
                        id="testGramCombinationInput"
                        label="Combinations"
                        description="Grams shown per level"
                        value={props.gramCombination}
                        min={1}
                        max={props.gramScope}
                        onCommit={props.setGramCombination}
                    />
                    <NumberField
                        id="testGramRepetitionInput"
                        label="Repetitions"
                        description="Times each level repeats"
                        value={props.gramRepetition}
                        min={0}
                        onCommit={props.setGramRepetition}
                    />
                    <NumberField
                        id="testGramWpmThresholdInput"
                        label="WPM threshold"
                        description="Speed needed to advance"
                        value={props.gramWpmThreshold}
                        min={0}
                        onCommit={props.setGramWpmThreshold}
                    />
                    <NumberField
                        id="testGramAccuracyThresholdInput"
                        label="Accuracy threshold"
                        description="Accuracy needed to advance"
                        value={props.gramAccuracyThreshold}
                        min={0}
                        max={100}
                        onCommit={props.setGramAccuracyThreshold}
                    />
                </div>
            </details>
        </div>
    )
}
