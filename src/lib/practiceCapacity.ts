/**
 * Prompt capacity for finite Practice. The 350-words-per-minute ceiling keeps
 * ample headroom for exceptional typists while scaling custom finite runs to
 * their configured duration.
 */
export function practiceWordCapacity(durationSeconds: number): number {
    return Math.ceil(durationSeconds * 350 / 60)
}
