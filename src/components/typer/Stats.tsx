import { TestModes } from "./types"

interface StatsProps {
    mode: TestModes,
    wpm: number,
    accuracy: number,
    averageWpm: number,
    levelText: string,
}

export const Stats = (props: StatsProps) => {
    return (
        <span className={`flex font-mono text-xl gap-4`}>
        {props.mode === TestModes.ngrams ?
                <>
                    <span><strong className="flex items-center">
                        {props.wpm.toFixed(1)}
                        <p className="flex h-full items-center ml-1 text-xl">wpm</p>
                        <p className="flex h-full items-center ml-1 text-xl">({props.averageWpm.toFixed(1)}avg)</p>
                    </strong></span>
                    <span><strong className="flex items-center">{props.levelText}</strong></span>
                </>
            :
                <>
                <span><strong className="flex items-center">{props.wpm.toFixed(1)}<p className="flex h-full items-center ml-1 text-xl">wpm</p></strong></span>
                <span><strong className="flex">{props.accuracy.toFixed(2)}<p className="flex items-center ml-1 text-xl">%</p></strong></span>
                </>
        }
        </span>
    )
}

