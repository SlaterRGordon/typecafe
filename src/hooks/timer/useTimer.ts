import { useCallback, useEffect, useReducer } from "react";
import type { Reducer } from "react";
import type { Config, ReturnValue, State } from "./types";
import { reducer } from "./reducer";
import type { TimerActionsType } from "./actions";

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
    const [state, dispatch] = useReducer<Reducer<State, TimerActionsType>>(reducer, {
        status: initialStatus,
        time: _initialTime,
        timerType,
        initialTime: _initialTime,
    });

    const { status, time, initialTime } = state;

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
        if (status !== 'STOPPED' && time === endTime) {
            dispatch({ type: 'stop' });

            if (typeof onTimeOver === 'function') {
                onTimeOver();
            }
        }
    }, [endTime, onTimeOver, time, status]);

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (status === 'RUNNING') {
            intervalId = setInterval(() => {
                dispatch({
                    type: 'set',
                    payload: {
                        newTime: timerType === 'DECREMENTAL' ? time - step : time + step,
                    },
                });
            }, interval);
        } else if (intervalId) {
            clearInterval(intervalId);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [status, step, timerType, interval, time]);

    return { advanceTime, pause, reset, start, setInitialTime, status, time };
};