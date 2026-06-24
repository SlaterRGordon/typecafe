import { useCallback, useEffect, useReducer } from "react";
import type { Config, ReturnValue, State } from "./types";
import { reducer } from "./reducer";
import { deriveTimerTime, nextTickDelay } from "./tick";

export const useTimer = ({
    autostart = false,
    endTime,
    initialStatus = 'STOPPED',
    _initialTime = 0,
    interval = 1000,
    onTimeOver,
    onTimeUpdate,
    step = 1,
    timerType = 'INCREMENTAL',
}: Partial<Config> = {}): ReturnValue => {
    const [state, dispatch] = useReducer(reducer, {
        status: initialStatus,
        time: _initialTime,
        timerType,
        initialTime: _initialTime,
        actualStartTime: Date.now(),
        actualEndTime: Date.now(),
    } satisfies State);

    const { status, time, initialTime, actualStartTime, actualEndTime } = state;

    const advanceTime = useCallback((timeToAdd: number) => {
        dispatch({ type: 'advanceTime', payload: { timeToAdd } });
    }, [dispatch]);

    const pause = useCallback(() => {
        dispatch({ type: 'pause' });
    }, []);

    const reset = useCallback(() => {
        dispatch({ type: 'reset', payload: { initialTime } });
    }, [initialTime]);

    const start = useCallback(() => {
        dispatch({ type: 'start', payload: { initialTime } });
    }, [initialTime]);

    const setInitialTime = useCallback((newInitialTime: number) => {
        dispatch({ type: 'setInitialTime', payload: { newInitialTime } });
    }, []);

    useEffect(() => {
        if (autostart) {
            dispatch({ type: 'start', payload: { initialTime } });
        }
    }, [autostart, initialTime]);

    useEffect(() => {
        if (typeof onTimeUpdate === 'function') {
            onTimeUpdate(time);
        }
    }, [time, onTimeUpdate]);

    useEffect(() => {
        if (status === 'STOPPED' || endTime == null) return;

        // The tick below derives time from the wall clock, so a throttled tab can
        // jump several steps at once — detect crossing the end, not just landing on it.
        const isOver = timerType === 'DECREMENTAL' ? time <= endTime : time >= endTime;
        if (isOver) {
            dispatch({ type: 'stop' });

            if (typeof onTimeOver === 'function') {
                onTimeOver();
            }
        }
    }, [endTime, onTimeOver, time, status, timerType]);

    // Drift-free ticking: each tick is scheduled against the wall-clock start time
    // and the displayed time is recomputed from elapsed real time, so render and
    // effect latency never accumulate into the countdown.
    useEffect(() => {
        if (status !== 'RUNNING') return;

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
                dispatch({ type: 'set', payload: { newTime } });
                scheduleNext();
            }, delay);
        };

        scheduleNext();

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [status, step, timerType, interval, actualStartTime, initialTime, endTime]);

    return { advanceTime, pause, reset, start, initialTime, setInitialTime, status, time, actualStartTime, actualEndTime};
};
