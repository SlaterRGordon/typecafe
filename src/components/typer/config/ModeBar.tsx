import { TestModes, TestSubModes } from "../types"

// The one test control surfaced on the main page. Switching modes is the
// product's headline differentiator (vision #5: "mode switching is visible on the
// main page"), so it lives inline above the typer. Every other setting — length,
// type, text, language, grams — stays in the settings modal to keep the screen
// quiet (the owner's call: differentiator on the surface, knobs behind the gear).
//
// index = TestModes value (normal, practice, ngrams, relaxed).
const MODE_LABELS = ["Normal", "Practice", "Grams", "Relaxed"]

interface ModeBarProps {
    mode: TestModes
    setMode: (mode: TestModes) => void
    setSubMode: (subMode: TestSubModes) => void
    setCount: (count: number) => void
    setCustomLength: (value: boolean) => void
}

export function ModeBar(props: ModeBarProps) {
    const handleModeChange = (next: TestModes) => {
        props.setMode(next)
        // Timed/Words is a Normal-only sub-mode; other modes take a practice-sized
        // word length (mirrors Config.handleModeChange so both entry points agree).
        if (next !== TestModes.normal) {
            props.setSubMode(TestSubModes.words)
            props.setCount(10)
            props.setCustomLength(false)
        }
    }

    return (
        <div
            data-testid="mode-bar"
            className="mx-auto mb-6 flex w-full max-w-md gap-1 rounded-lg border border-base-content/15 bg-base-200/40 p-1"
        >
            {MODE_LABELS.map((label, i) => (
                <button
                    key={label}
                    type="button"
                    aria-pressed={props.mode === i}
                    onClick={() => handleModeChange(i as TestModes)}
                    className={`flex-1 basis-0 rounded-md px-2 py-2 text-center text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${props.mode === i ? "bg-primary text-primary-content shadow-sm" : "text-base-content/60 hover:bg-base-content/5"}`}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}
