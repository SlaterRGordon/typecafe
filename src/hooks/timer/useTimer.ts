import { useCallback, useEffect, useRef, useState } from "react";
import { deriveTimerTime, nextTickDelay } from "./tick";
import type { TimerType } from "./types";

// A drift-free clock for tests. Two kinds of timer run a live, ticking clock:
// the timed-Normal DECREMENTAL countdown, and an explicit `countUp` stopwatch
// (Timed ∞ — no timer, but the elapsed seconds are shown rising). Both schedule
// ticks against the wall-clock start and re-derive the displayed time each tick
// (see tick.ts), so render/tab latency never accumulates into drift. Every other
// INCREMENTAL use is clockless: the displayed time isn't shown and elapsed time is
// measured from the keystroke recorder's timeline, not here — so it doesn't tick,
// it just stamps the start time (the empty-timeline fallback for stats/live WPM).

interface Config {
    _initialTime: number;
    timerType: TimerType;
    endTime: number | null;
    interval: number;
    step: number;
    // Run a live rising clock for an INCREMENTAL timer (Timed ∞). DECREMENTAL
    // countdowns always run a clock regardless of this flag.
    countUp: boolean;
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
    countUp = false,
    onTimeOver,
}: Partial<Config> = {}): ReturnValue => {
    const [running, setRunning] = useState(false);
    const [time, setTime] = useState(_initialTime);
    const [initialTime, setInitialTimeState] = useState(_initialTime);
    const [actualStartTime, setActualStartTime] = useState(() => Date.now());

    // A DECREMENTAL countdown fires onTimeOver when it crosses the end; a count-up
    // clock never auto-ends. Both run a live, ticking clock.
    const counts = timerType === 'DECREMENTAL' && endTime != null;
    const runsClock = counts || countUp;

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

    // Drift-free ticking, scheduled against the wall-clock start. Runs for a live
    // clock (countdown or count-up) — clockless modes never enter here.
    useEffect(() => {
        if (!running || !runsClock) return;

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
    }, [running, runsClock, step, timerType, interval, actualStartTime, initialTime, endTime]);

    return { time, start, pause, setInitialTime, actualStartTime };
};
