export type TimerType = 'DECREMENTAL' | 'INCREMENTAL';

export type Status = 'RUNNING' | 'PAUSED' | 'STOPPED';

export interface State {
    status: Status;
    initialTime: number;
    time: number;
    timerType: TimerType;
    actualStartTime: number;
    actualEndTime: number;
}

export type ReturnValue = {
    advanceTime: (timeToAdd: number) => void;
    pause: () => void;
    reset: () => void;
    start: () => void;
    setInitialTime: (newInitialTime: number) => void;
    status: Status;
    time: number;
    actualStartTime: number;
    actualEndTime: number;
};

export type Config = {
    autostart: boolean;
    endTime: number | null;
    initialStatus: Status;
    _initialTime: number;
    _initialActualTime: number,
    interval: number;
    onTimeOver?: () => void;
    onTimeUpdate?: (time: number) => void;
    step: number;
    timerType: TimerType;
    actualStartTime: number;
    actualEndTime: number;
};