import { TestModes, TestSubModes } from "../types"

type ToolbarMode = {
    label: string
    mode: TestModes
    subMode?: TestSubModes
    defaultCount: number
}

// Phase 2 makes Timed and Words user-facing top-level modes. Internally they
// still map to Normal + subMode for now so scoring, persistence, and existing
// history stay stable while the UI model moves first.
const TOOLBAR_MODES: ToolbarMode[] = [
    { label: "Timed", mode: TestModes.normal, subMode: TestSubModes.timed, defaultCount: 15 },
    { label: "Words", mode: TestModes.normal, subMode: TestSubModes.words, defaultCount: 10 },
    { label: "Practice", mode: TestModes.practice, defaultCount: 10 },
    { label: "Grams", mode: TestModes.ngrams, defaultCount: 10 },
    { label: "Relaxed", mode: TestModes.relaxed, defaultCount: 10 },
]

interface ModeBarProps {
    mode: TestModes
    subMode: TestSubModes
    setMode: (mode: TestModes) => void
    setSubMode: (subMode: TestSubModes) => void
    setCount: (count: number) => void
    setCustomLength: (value: boolean) => void
}

export function ModeBar(props: ModeBarProps) {
    const isActive = (option: ToolbarMode) => {
        if (option.mode === TestModes.normal) {
            return props.mode === TestModes.normal && props.subMode === option.subMode
        }
        return props.mode === option.mode
    }

    const handleModeChange = (next: ToolbarMode) => {
        props.setMode(next.mode)
        props.setCustomLength(false)
        props.setCount(next.defaultCount)

        if (next.mode === TestModes.normal && next.subMode !== undefined) {
            props.setSubMode(next.subMode)
        } else {
            // Other modes should never carry a leftover timed countdown from a
            // prior Timed test.
            props.setSubMode(TestSubModes.words)
        }
    }

    return (
        <div
            data-testid="mode-bar"
            aria-label="Typing mode"
            className="mx-auto mb-6 flex w-full max-w-xl gap-1 rounded-lg border border-base-content/15 bg-base-200/40 p-1"
        >
            {TOOLBAR_MODES.map((option) => {
                const active = isActive(option)
                return (
                    <button
                        key={option.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => handleModeChange(option)}
                        className={`flex-1 basis-0 rounded-md px-2 py-2 text-center text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-primary text-primary-content shadow-sm" : "text-base-content/60 hover:bg-base-content/5"}`}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
