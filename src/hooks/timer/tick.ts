// Pure timer math, extracted so it can be unit-tested without React. The whole
// point of the rewrite is that the displayed time is always re-derived from the
// wall clock (Date.now() - startMs), never chained off the previous tick - so
// render and effect latency between ticks can never accumulate into drift.

import type { TimerType } from "./types"

export interface DeriveTimeInput {
    now: number,
    startMs: number,
    initialTime: number,
    interval: number,
    step: number,
    timerType: TimerType,
    // null/undefined means "no end clamp" - the `!= null` guard handles both.
    endTime: number | null | undefined,
}

// The value the timer should display right now, derived purely from how much
// real time has elapsed since it started. Because it reads the clock instead of
// adding to the last value, a tick that fires late produces the correct value
// anyway and the next tick stays aligned.
export function deriveTimerTime(input: DeriveTimeInput): number {
    const { now, startMs, initialTime, interval, step, timerType, endTime } = input
    const elapsedSteps = Math.round((now - startMs) / interval) * step
    let time = timerType === "DECREMENTAL" ? initialTime - elapsedSteps : initialTime + elapsedSteps
    if (endTime != null) {
        time = timerType === "DECREMENTAL" ? Math.max(time, endTime) : Math.min(time, endTime)
    }
    return time
}

// Delay until the next whole-interval boundary measured from startMs. Each
// scheduled tick re-aligns to the wall clock (start + n*interval), so a late
// tick simply gets a shorter next delay and the timer catches back up rather
// than drifting further behind with every tick.
export function nextTickDelay(now: number, startMs: number, interval: number): number {
    const nextTick = Math.floor((now - startMs) / interval) + 1
    return Math.max(startMs + nextTick * interval - now, 0)
}
