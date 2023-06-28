interface StatsProps {
    wpm: number,
    accuracy: number,
}

export const Stats = (props: StatsProps) => {
    return (
        <span className={`flex font-mono text-xl gap-4`}>
            <span className="flex items-center">{props.wpm.toFixed(1)}<p className="flex h-full items-center ml-1 text-xl">wpm</p></span>
            <span className="flex">{props.accuracy.toFixed(2)}<p className="flex items-center ml-1 text-xl">%</p></span>
        </span>
    )
}

