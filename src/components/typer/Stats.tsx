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
}

export const Stats = (props: StatsProps) => {
    const wpmBlank = props.pending || props.wpmPending
    const wpmText = wpmBlank ? "—" : props.wpm.toFixed(1)
    const averageWpmText = wpmBlank ? "—" : props.averageWpm.toFixed(1)
    const accuracyText = props.pending ? "—" : props.accuracy.toFixed(2)

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
