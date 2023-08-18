interface StatsProps {
    wpm: number,
    accuracy: number,
}

export const Stats = (props: StatsProps) => {
    return (
        <span className={`flex font-mono text-xl gap-4`}>
            <span><strong className="flex items-center">{props.wpm.toFixed(1)}<p className="flex h-full items-center ml-1 text-xl">wpm</p></strong></span>
            <span><strong className="flex">{props.accuracy.toFixed(2)}<p className="flex items-center ml-1 text-xl">%</p></strong></span>
        </span>
    )
}

