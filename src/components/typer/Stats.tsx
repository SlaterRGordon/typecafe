import { TestModes } from "./types"

interface StatsProps {
    mode: TestModes,
    wpm: number,
    accuracy: number,
    averageWpm: number,
    levelText: string,
    // True before the first keystroke of an attempt — show placeholders instead
    // of "0.0wpm 0.00%", which reads as a failing score.
    pending?: boolean,
    // True while the sample is too small to yield a trustworthy WPM (e.g. a
    // 2-char grams level). The WPM and its average show "—"; accuracy still shows.
    wpmPending?: boolean,
    // "inline" (default): the legacy single-line treatment used by the learn
    // control bar. "stacked": the Phase 2 vision treatment — small label over a
    // large value, with the timed countdown as a leading cell — shown above the
    // typing text on the main page.
    layout?: "inline" | "stacked",
    // stacked only: when timed, the remaining seconds render as the first cell and
    // stay visible regardless of the live-stats toggle.
    isTimed?: boolean,
    // stacked only: Timed ∞ (no timer) — show `time` as an elapsed count-up cell
    // instead of a countdown, so the typist still sees a clock running.
    countUp?: boolean,
    time?: number,
    // stacked only: whether the live WPM/accuracy cells render (live-stats toggle).
    showLiveStats?: boolean,
}

// One stacked metric: a small uppercase label above a large mono value.
function StatCell(props: { label: string, value: string }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-base-content/40">{props.label}</span>
            <span data-testid={`stat-${props.label}`} className="font-mono text-xl font-semibold leading-none text-base-content sm:text-2xl">{props.value}</span>
        </div>
    )
}

export const Stats = (props: StatsProps) => {
    const wpmBlank = props.pending || props.wpmPending
    const wpmText = wpmBlank ? "—" : props.wpm.toFixed(1)
    const averageWpmText = wpmBlank ? "—" : props.averageWpm.toFixed(1)
    const accuracyText = props.pending ? "—" : props.accuracy.toFixed(2)

    if (props.layout === "stacked") {
        const cells: { label: string, value: string }[] = []
        if (props.mode === TestModes.ngrams) {
            // Grams: live speed/accuracy gate on the toggle, but level progress is
            // always shown — it's the drill's sense of place, not a "live stat".
            if (props.showLiveStats) {
                cells.push({ label: "wpm", value: wpmText })
                cells.push({ label: "avg", value: averageWpmText })
                cells.push({ label: "acc", value: props.pending ? "—" : `${accuracyText}%` })
            }
            cells.push({ label: "level", value: props.levelText })
        } else {
            if (props.isTimed || props.countUp) cells.push({ label: "time", value: String(props.time ?? 0) })
            if (props.showLiveStats) {
                cells.push({ label: "wpm", value: wpmText })
                cells.push({ label: "acc", value: props.pending ? "—" : `${accuracyText}%` })
            }
        }
        if (cells.length === 0) return null

        return (
            <div className="flex items-end gap-4 sm:gap-6">
                {cells.map((cell, index) => (
                    <div key={cell.label} className="flex items-end gap-4 sm:gap-6">
                        {index > 0 && <div className="h-9 w-px self-stretch bg-base-content/15 sm:h-10" />}
                        <StatCell label={cell.label} value={cell.value} />
                    </div>
                ))}
            </div>
        )
    }

    return (
        <span className={`flex font-mono text-xl gap-4`}>
        {props.mode === TestModes.ngrams ?
                <>
                    <span><strong className="flex items-center">
                        {wpmText}
                        <p className="flex h-full items-center ml-1 text-xl">wpm</p>
                        <p className="flex h-full items-center ml-1 text-xl">({averageWpmText}avg)</p>
                    </strong></span>
                    <span><strong className="flex">{accuracyText}<p className="flex items-center ml-1 text-xl">%</p></strong></span>
                    <span><strong className="flex items-center">{props.levelText}</strong></span>
                </>
            :
                <>
                <span><strong className="flex items-center">{wpmText}<p className="flex h-full items-center ml-1 text-xl">wpm</p></strong></span>
                <span><strong className="flex">{accuracyText}<p className="flex items-center ml-1 text-xl">%</p></strong></span>
                </>
        }
        </span>
    )
}
