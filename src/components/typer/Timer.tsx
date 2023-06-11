import { useEffect, useState } from "react"

interface TimerProps {
    time: number | null,
    started: boolean,
    onComplete: () => void,
}

export const Timer = (props: TimerProps) => {
    const [timer, setTimer] = useState(props.time ? props.time : 0)

    useEffect(() => {
        if (!props.started) {
            setTimer(props.time ? props.time : 0)
            return
        }

        const interval = setInterval(() => {
            setTimer((timer) => timer - 1)
            if (timer <= 0) {
                props.onComplete()
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [props, timer])

    return (
        <div className={`py-2`}>
            <span className={`font-mono text-4xl`}>
                <span>{timer}</span>
            </span>
        </div>
    )
}

