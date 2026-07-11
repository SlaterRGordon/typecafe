// Speed-vs-accuracy stance (Phase 4 §4.3): one honest, computed coaching
// sentence from recent history. Pure, unit-testable. The cheapest coach-like
// signal we can ship - rule-based, no LLM. Thresholds live in one object so
// they can be documented on /how-we-measure and tuned in one place.

import { averageAccuracy, averageConsistency, filterByPeriod, headlineDelta, type ProgressRecord } from "./progress"

export const STANCE_THRESHOLDS = {
    // Below this accuracy you're losing more to errors than you'd gain from speed.
    accuracyFloor: 94,
    // Above this you have headroom to push the pace.
    accuracyCeiling: 98,
    // Below this consistency your pace is bursty - room to push in drills.
    consistencyFloor: 70,
    // |WPM delta| under this over the window counts as "not clearly improving".
    flatDeltaWpm: 1,
    // Period (days) the stance reads, and the minimum tests to call it.
    windowDays: 30,
    minTests: 5,
} as const

export type Stance = "accuracy-limited" | "confidence-limited" | "balanced"

export interface StanceResult {
    enoughData: boolean
    stance: Stance
    headline: string
    advice: string
}

const COPY: Record<Stance, { headline: string; advice: string }> = {
    "accuracy-limited": {
        headline: "Accuracy is capping your speed",
        advice: "Slow down about 10% - clean reps build speed faster than rushed errors.",
    },
    "confidence-limited": {
        headline: "You're playing it too safe",
        advice: "Push the pace and let errors happen in drills - your accuracy has room to spare.",
    },
    balanced: {
        headline: "Speed and accuracy are moving together",
        advice: "Keep your current mix - nothing to change right now.",
    },
}

export function computeStance(records: ProgressRecord[], now: Date): StanceResult {
    const recent = filterByPeriod(records, STANCE_THRESHOLDS.windowDays, now)
    if (recent.length < STANCE_THRESHOLDS.minTests) {
        return { enoughData: false, stance: "balanced", ...COPY.balanced }
    }

    const accuracy = averageAccuracy(recent)
    const consistency = averageConsistency(recent)
    const delta = headlineDelta(records, STANCE_THRESHOLDS.windowDays, now).delta
    const improving = delta !== null && delta > STANCE_THRESHOLDS.flatDeltaWpm

    let stance: Stance
    if (accuracy < STANCE_THRESHOLDS.accuracyFloor && !improving) {
        // Low accuracy and not already climbing → errors are the bottleneck.
        stance = "accuracy-limited"
    } else if (
        accuracy > STANCE_THRESHOLDS.accuracyCeiling &&
        consistency !== null &&
        consistency < STANCE_THRESHOLDS.consistencyFloor
    ) {
        // Near-perfect but bursty → headroom to push pace.
        stance = "confidence-limited"
    } else {
        stance = "balanced"
    }

    return { enoughData: true, stance, ...COPY[stance] }
}
