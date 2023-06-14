interface StatsProps {
    wpm: number | null,
    accuracy: number | null,
}

export const Stats = (props: StatsProps) => {

    return (
        <span className={`flex font-mono text-2xl gap-4`}>
            {props.wpm === null ?
                <span className="flex items-center">0<p className="flex items-center ml-2 text-xl">wpm</p></span>
                :
                <span className="flex items-center">{props.wpm}<p className="flex h-full items-center ml-2 text-xl">wpm</p></span>
            }
            {props.accuracy === null ?
                <span className="flex">0.00<p className="flex items-center ml-2 text-xl">%</p></span>
                :
                <span className="flex">{props.accuracy.toFixed(2)}<p className="flex items-center ml-2 text-xl">%</p></span>
            }
        </span>
    )
}

