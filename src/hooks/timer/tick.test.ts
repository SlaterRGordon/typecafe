import { afterEach, describe, expect, it, vi } from "vitest"
import { deriveTimerTime, nextTickDelay } from "./tick"

const decremental = {
    startMs: 1_000_000,
    initialTime: 60,
    interval: 1000,
    step: 1,
    timerType: "DECREMENTAL" as const,
    endTime: 0,
}

describe("deriveTimerTime", () => {
    it("re-derives remaining time from the wall clock, not the previous value", () => {
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs })).toBe(60)
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs + 1000 })).toBe(59)
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs + 30_000 })).toBe(30)
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs + 60_000 })).toBe(0)
    })

    it("a late tick reads the correct value rather than a stale one", () => {
        // The tick for the 10s boundary fires 90ms late; it must still read 50, not 51.
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs + 10_000 + 90 })).toBe(50)
    })

    it("clamps at endTime for a decremental timer that overshoots", () => {
        expect(deriveTimerTime({ ...decremental, now: decremental.startMs + 120_000 })).toBe(0)
    })

    it("counts up and clamps at endTime for an incremental timer", () => {
        const inc = { ...decremental, initialTime: 0, timerType: "INCREMENTAL" as const, endTime: 5 }
        expect(deriveTimerTime({ ...inc, now: inc.startMs + 3000 })).toBe(3)
        expect(deriveTimerTime({ ...inc, now: inc.startMs + 9000 })).toBe(5)
    })
})

describe("nextTickDelay", () => {
    it("targets the next whole-interval boundary measured from the start", () => {
        expect(nextTickDelay(1_000_000, 1_000_000, 1000)).toBe(1000)
        expect(nextTickDelay(1_000_300, 1_000_000, 1000)).toBe(700)
    })

    it("shortens the delay after a late tick so the timer re-aligns", () => {
        // A tick that fired 80ms into the 5th second leaves only 920ms to the next boundary.
        expect(nextTickDelay(1_000_000 + 4080, 1_000_000, 1000)).toBe(920)
    })
})

describe("countdown drift over a 60s test", () => {
    afterEach(() => vi.useRealTimers())

    it("reaches 0 within 100ms of the true 60s mark despite per-tick jitter", () => {
        vi.useFakeTimers()
        const startMs = Date.now()
        const interval = 1000
        // Adversarial but bounded scheduler latency: every tick fires up to 80ms late.
        const jitter = [37, 71, 12, 80, 5, 63, 49, 22, 78, 41]
        let i = 0
        let firedAt: number | null = null

        // Mirror useTimer's scheduleNext loop exactly, but model each callback firing
        // `lateBy` ms after its intended boundary. Because the delay is recomputed
        // against startMs every tick, that lateness never accumulates.
        const scheduleNext = () => {
            const delay = nextTickDelay(Date.now(), startMs, interval)
            const lateBy = jitter[i % jitter.length]!
            i++
            setTimeout(() => {
                const time = deriveTimerTime({
                    now: Date.now(), startMs, initialTime: 60, interval, step: 1,
                    timerType: "DECREMENTAL", endTime: 0,
                })
                if (time <= 0 && firedAt === null) firedAt = Date.now()
                else if (time > 0) scheduleNext()
            }, delay + lateBy)
        }

        scheduleNext()
        vi.advanceTimersByTime(70_000)

        expect(firedAt).not.toBeNull()
        expect(Math.abs((firedAt! - startMs) - 60_000)).toBeLessThanOrEqual(100)
    })
})
