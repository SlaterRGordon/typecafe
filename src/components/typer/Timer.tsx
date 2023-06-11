import { useEffect, useState } from "react"

interface TimerProps {
    time: number,
    started: boolean,
    onComplete: () => void,
}

export const Timer = (props: TimerProps) => {
    const [time, setTime] = useState(props.time * 1000)
    const [referenceTime, setReferenceTime] = useState(Date.now())

    useEffect(() => {
        const countdown = () => {
            setTime(prevTime => {
                if (prevTime <= 0) return 0

                const now = Date.now()
                const interval = now - referenceTime
                setReferenceTime(now)

                return prevTime - interval
            })
        }

        if (props.started) {
            const timeout = setTimeout(countdown, 1000)

            return () => {
                clearTimeout(timeout)
            }
        } else {
            setTime(props.time * 1000)
        }
    }, [referenceTime, props])

    useEffect(() => {
        if (props.started) {
            setReferenceTime(Date.now())
        }
    }, [props.started])

    return (
        <div className={`py-2`}>
            <span className={`font-mono text-4xl`}>
                <span>{(time / 1000).toFixed(0)}</span>
            </span>
        </div>
    )
}

