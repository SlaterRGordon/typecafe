import { createActionType } from './helpers';

const ADVANCE_TIME = (timeToAdd: number) =>
  createActionType('advanceTime', { timeToAdd });

const PAUSE = () => createActionType('pause');

const RESET = (initialTime: number) =>
  createActionType('reset', { initialTime });

const SET = (newTime: number) => createActionType('set', { newTime });

const SET_INITIAL_TIME = (newInitialTime: number) => createActionType('setInitialTime', { newInitialTime });

const START = (initialTime: number) =>
  createActionType('start', { initialTime });

const STOP = () => createActionType('stop');

export type TimerActionsType = ReturnType<
  | typeof ADVANCE_TIME
  | typeof PAUSE
  | typeof RESET
  | typeof SET
  | typeof SET_INITIAL_TIME
  | typeof START
  | typeof STOP
>;