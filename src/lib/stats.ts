// Pure typing-test math. No React, no DOM — everything here is unit-testable.

// Rolling-window settings for the WPM-over-time chart. The headline WPM stays a
// pure cumulative figure (chars / 5 over total elapsed time); these constants only
// shape the instantaneous samples plotted on the graph.
export const WPM_WINDOW_SECONDS = 1
export const WPM_MIN_WINDOW_SECONDS = 0.2
export const WPM_SAMPLE_TARGET_POINTS = 60
export const WPM_MIN_SAMPLE_STEP_SECONDS = 0.1

// A WPM figure is only meaningful once enough time and enough keystrokes have
// accrued. Below this, a tiny sample extrapolates to absurd speeds — e.g. a
// 2-character grams level typed in 0.2s reads as "500 wpm". Callers should show
// a placeholder ("—") instead of a number until a sample clears both bars.
export const WPM_MIN_RELIABLE_SECONDS = 1
export const WPM_MIN_RELIABLE_KEYSTROKES = 5

export function isReliableWpmSample(durationSeconds: number, keystrokes: number): boolean {
    return durationSeconds >= WPM_MIN_RELIABLE_SECONDS && keystrokes >= WPM_MIN_RELIABLE_KEYSTROKES
}

// Ranking floor — separate from, and firmer than, the display floor above.
// A *ranked* test feeds lifetime aggregates (daily rollups, streaks, the WPM
// trend, percentile pools, the brag line), so a stray 1–3 keystroke or abandoned
// test must not count: it would inflate streaks and pollute the trend the whole
// product is built to prove. A genuine attempt clears this easily; the numbers
// are tunable and documented on /how-we-measure.
export const RANKABLE_MIN_SECONDS = 3
export const RANKABLE_MIN_KEYSTROKES = 10

export function isRankableSample(durationSeconds: number, keystrokes: number): boolean {
    return durationSeconds >= RANKABLE_MIN_SECONDS && keystrokes >= RANKABLE_MIN_KEYSTROKES
}

export interface WpmSample {
    elapsedSeconds: number,
    wpm: number,
}

// One entry per typed character, in order, with whether it matched the expected
// character. This is the source of truth for highlighting typed errors on the
// results dashboard and shareable card.
export interface TypedSegment {
    ch: string,
    correct: boolean,
}

// One entry per keystroke: the wall-clock time it happened and the net character
// count at that moment (backspaces lower the count). This raw timeline is the
// single source of truth for both the live WPM and the over-time chart.
export interface Keystroke {
    t: number,
    chars: number,
}

// Net characters typed at or before `elapsedSec` (seconds since the first keystroke).
export function charsAtElapsed(timeline: Keystroke[], t0: number, elapsedSec: number) {
    let chars = 0
    for (const stroke of timeline) {
        if ((stroke.t - t0) / 1000 <= elapsedSec + 1e-9) chars = stroke.chars
        else break
    }
    return chars
}

// Instantaneous raw WPM over a trailing window ending at `elapsedSec`. The window
// shrinks toward the start of the test but never below WPM_MIN_WINDOW_SECONDS, so a
// lone early keystroke does not extrapolate to an unbounded spike.
export function instantaneousWpm(timeline: Keystroke[], t0: number, elapsedSec: number) {
    const windowSeconds = Math.min(WPM_WINDOW_SECONDS, Math.max(elapsedSec, WPM_MIN_WINDOW_SECONDS))
    const charsInWindow = charsAtElapsed(timeline, t0, elapsedSec) - charsAtElapsed(timeline, t0, elapsedSec - windowSeconds)
    if (charsInWindow <= 0) return 0
    return (charsInWindow / 5) / (windowSeconds / 60)
}

// Real-data samples for the chart: walk evenly from the first keystroke to the last,
// reading instantaneous WPM straight from the recorded timeline. Nothing is
// backfilled or interpolated from a stale cumulative count.
export function buildWpmSamples(timeline: Keystroke[]): WpmSample[] {
    if (timeline.length === 0) return []
    const t0 = timeline[0]!.t
    const endElapsed = (timeline[timeline.length - 1]!.t - t0) / 1000
    if (endElapsed <= 0) return [{ elapsedSeconds: 0, wpm: 0 }]

    const step = Math.max(endElapsed / WPM_SAMPLE_TARGET_POINTS, WPM_MIN_SAMPLE_STEP_SECONDS)
    const samples: WpmSample[] = []
    for (let elapsed = step; elapsed < endElapsed; elapsed += step) {
        samples.push({ elapsedSeconds: elapsed, wpm: instantaneousWpm(timeline, t0, elapsed) })
    }
    samples.push({ elapsedSeconds: endElapsed, wpm: instantaneousWpm(timeline, t0, endElapsed) })
    return samples
}

export interface TestStats {
    speed: number,
    rawWpm: number,
    netWpm: number,
    accuracy: number,
    durationSeconds: number,
}

export interface ComputeStatsInput {
    timeline: Keystroke[],
    characterCount: number,
    incorrectCount: number,
    // Timed tests always run the full configured duration; otherwise duration is
    // measured from the first keystroke to the last recorded one.
    isTimed: boolean,
    timedDurationSeconds: number,
    // Used only when the timeline is empty (e.g. timer expired with no keystrokes).
    fallbackStartTime: number,
    now?: number,
}

export function computeStats(input: ComputeStatsInput): TestStats {
    const { timeline, characterCount, incorrectCount, isTimed, timedDurationSeconds, fallbackStartTime } = input
    const startTime = timeline.length > 0 ? timeline[0]!.t : fallbackStartTime
    const endTime = timeline.length > 0 ? timeline[timeline.length - 1]!.t : (input.now ?? Date.now())
    const durationSeconds = isTimed ? timedDurationSeconds : Math.max((endTime - startTime) / 1000, 0)
    const minutes = durationSeconds / 60
    const speed = minutes <= 0 ? 0 : (characterCount / 5) / minutes
    const correctCount = characterCount - incorrectCount
    const accuracy = characterCount === 0 ? 0 : correctCount / characterCount * 100
    const netWpm = minutes <= 0 ? 0 : Math.max(((correctCount - incorrectCount) / 5) / minutes, 0)

    return { speed, rawWpm: speed, netWpm, accuracy, durationSeconds }
}

export interface KeyAccuracy {
    key: string,
    accuracy: number,
    attempts: number,
}

// The keys the user missed most this test, worst first. Keys with very few
// attempts are skipped (one slip on a rare key isn't a pattern), as are keys
// typed perfectly.
export function worstKeysFromAttempts(
    attempts: Map<string, { attempts: number, correct: number }>,
    limit = 3,
    minAttempts = 3,
): KeyAccuracy[] {
    return Array.from(attempts.entries())
        .filter(([, value]) => value.attempts >= minAttempts)
        .map(([key, value]) => ({
            key,
            accuracy: (value.correct / value.attempts) * 100,
            attempts: value.attempts,
        }))
        .filter((entry) => entry.accuracy < 100)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, limit)
}

// Before/after WPM change for the re-measure loop: rerun the diagnosed test
// after a drill and report the gain. `improved` treats a flat result (0) as a
// non-improvement so the UI doesn't claim a win that isn't there.
export function wpmImprovement(beforeWpm: number, afterWpm: number): { delta: number, improved: boolean } {
    const delta = afterWpm - beforeWpm
    return { delta, improved: delta > 0 }
}

// Consistency expresses how steady the instantaneous WPM stayed over the test:
// 100% means perfectly even pace, lower values mean bursty typing. Derived from
// the coefficient of variation of the chart samples, clamped to [0, 100].
export function consistencyFromSamples(samples: WpmSample[]): number {
    if (samples.length < 2) return 0
    const wpms = samples.map((s) => s.wpm)
    const mean = wpms.reduce((sum, v) => sum + v, 0) / wpms.length
    if (mean <= 0) return 0
    const variance = wpms.reduce((sum, v) => sum + (v - mean) ** 2, 0) / wpms.length
    const coefficientOfVariation = Math.sqrt(variance) / mean
    return Math.min(Math.max((1 - coefficientOfVariation) * 100, 0), 100)
}
