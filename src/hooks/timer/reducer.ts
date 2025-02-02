import type { TimerActionsType } from './actions';
import type { State } from './types';

export const reducer = (state: State, action: TimerActionsType): State => {
    switch (action.type) {
        case "advanceTime": {
            const { timeToAdd } = action.payload;

            return {
                ...state,
                time:
                    state.timerType === 'DECREMENTAL'
                        ? state.time - timeToAdd
                        : state.time + timeToAdd,
            };
        }
        case "pause": {
            return {
                ...state,
                status: 'PAUSED',
            };
        }
        case "reset": {
            const { initialTime } = action.payload;

            return {
                ...state,
                status: 'STOPPED',
                time: initialTime,
            };
        }
        case "set": {
            const { newTime } = action.payload;

            return {
                ...state,
                time: newTime,
            };
        }
        case "setInitialTime": {
            const { newInitialTime } = action.payload;

            return {
                ...state,
                time: newInitialTime,
                initialTime: newInitialTime,
            };
        }
        case "start": {
            const { initialTime } = action.payload;
            const actualTime = Date.now();

            return {
                ...state,
                status: 'RUNNING',
                time: initialTime,
                actualStartTime: actualTime,
            };
        }
        case "stop": {
            const actualTime = Date.now();

            return {
                ...state,
                status: 'STOPPED',
                actualEndTime: actualTime,
            };
        }
        default: {
            return state;
        }
    }
}