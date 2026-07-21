import { type PracticeDurationSeconds } from "./evidenceContext"

/**
 * Prompt capacity for finite Practice. The 350-words-per-minute ceiling keeps
 * ample headroom for exceptional typists without compiling the 240-second
 * maximum for every shorter run.
 */
export function practiceWordCapacity(durationSeconds: PracticeDurationSeconds): number {
    return Math.ceil(durationSeconds * 350 / 60)
}
