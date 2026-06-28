import { useCallback, useEffect, useRef, useState } from "react";
import { deriveTimerTime, nextTickDelay } from "./tick";
import type { TimerType } from "./types";

// A drift-free countdown for timed tests — and nothing more. Only DECREMENTAL
// (timed Normal) actually runs a clock: it schedules ticks against the wall-clock
// start and re-derives the remaining time each tick (see tick.ts), so render/tab
// latency never accumulates into the countdown. Every other mode is INCREMENTAL,
// where the displayed time isn't shown and elapsed time is measured from the
// keystroke recorder's timeline, not here — so we don't tick at all, we just
// stamp the start time (the empty-timeline fallback for stats/live WPM).

interface Config {
    _initialTime: number;
    timerType: TimerType;
    endTime: number | null;
    interval: number;
    step: number;
    onTimeOver?: () => void;
}

interface ReturnValue {
    time: number;
    start: () => void;
    pause: () => void;
    setInitialTime: (newInitialTime: number) => void;
    actualStartTime: number;
}

export const useTimer = ({
    _initialTime = 0,
    timerType = 'INCREMENTAL',
    endTime = null,
    interval = 1000,
    step = 1,
    onTimeOver,
}: Partial<Config> = {}): ReturnValue => {
    const [running, setRunning] = useState(false);
    const [time, setTime] = useState(_initialTime);
    const [initialTime, setInitialTimeState] = useState(_initialTime);
    const [actualStartTime, setActualStartTime] = useState(() => Date.now());

    const counts = timerType === 'DECREMENTAL' && endTime != null;

    const start = useCallback(() => {
        setActualStartTime(Date.now());
        setTime(initialTime);
        setRunning(true);
    }, [initialTime]);

    const pause = useCallback(() => setRunning(false), []);

    const setInitialTime = useCallback((newInitialTime: number) => {
        setInitialTimeState(newInitialTime);
        setTime(newInitialTime);
    }, []);

    // Fire onTimeOver once when the countdown crosses the end. A throttled tab can
    // jump several steps in one tick, so detect crossing (<=), not landing on it.
    const onTimeOverRef = useRef(onTimeOver);
    useEffect(() => { onTimeOverRef.current = onTimeOver; }, [onTimeOver]);
    useEffect(() => {
        if (!running || !counts) return;
        if (time <= (endTime as number)) {
            setRunning(false);
            onTimeOverRef.current?.();
        }
    }, [running, counts, time, endTime]);

    // Drift-free ticking, scheduled against the wall-clock start. Only runs for a
    // real countdown — non-timed modes never enter here.
    useEffect(() => {
        if (!running || !counts) return;

        let cancelled = false;
        let timeoutId: NodeJS.Timeout;
        const startMs = actualStartTime;

        const scheduleNext = () => {
            const delay = nextTickDelay(Date.now(), startMs, interval);
            timeoutId = setTimeout(() => {
                if (cancelled) return;
                const newTime = deriveTimerTime({
                    now: Date.now(), startMs, initialTime, interval, step, timerType, endTime,
                });
                setTime(newTime);
                scheduleNext();
            }, delay);
        };

        scheduleNext();

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [running, counts, step, timerType, interval, actualStartTime, initialTime, endTime]);

    return { time, start, pause, setInitialTime, actualStartTime };
};
