import { useEffect, useState } from "react"

interface StatsProps {
    wpm: number | null,
    accuracy: number | null,
}

export const Stats = (props: StatsProps) => {

    return (
        <div className={`absolute left-0 py-2`}>
            <span className={`flex font-mono text-4xl gap-4`}>
                {props.wpm === null ?
                    <span className="flex">0<p className="flex items-center ml-2 text-2xl">wpm</p></span>
                    :
                    <span className="flex">{props.wpm}<p className="flex items-center ml-2 text-2xl">wpm</p></span>
                }
                {props.accuracy === null ?
                    <span className="flex">0.00<p className="flex items-center ml-2 text-2xl">%</p></span>
                    :
                    <span className="flex">{props.accuracy.toFixed(2)}<p className="flex items-center ml-2 text-2xl">%</p></span>
                }
            </span>
        </div>
    )
}

