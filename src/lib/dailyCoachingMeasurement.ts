import type { CoachingTarget } from "./coachingTarget"
import { sameCoachingTarget, targetDisplayLabel } from "./coachingTarget"
import type { DailyCoachingSession, DailySet, DailyStep, FrozenRecommendation } from "./dailyCoaching"
import { DRILL_SAMPLE_QUOTAS } from "./drill"
import { decodeTimeline, type EncodedTimeline, type KeystrokeEvent } from "./keystrokes"

function sequences(events: readonly KeystrokeEvent[], sequence: string): { values: number[], correct: number, count: number } {
    const wanted = sequence.toLocaleLowerCase()
    const values: number[] = []
    let correct = 0
    let count = 0
    for (let index = 0; index + [...wanted].length <= events.length; index += 1) {
        const slice = events.slice(index, index + [...wanted].length)
        if (slice.map((event) => event.key.toLocaleLowerCase()).join("") !== wanted) continue
        count += 1
        if (!slice.every((event) => event.correct)) continue
        correct += 1
        let total = 0
        let valid = true
        for (let inner = 1; inner < slice.length; inner += 1) {
            const delta = slice[inner]!.t - slice[inner - 1]!.t
            if (delta <= 0 || delta > 2_000) valid = false
            total += delta
        }
        if (valid) values.push(total)
    }
    return { values, correct, count }
}

function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function targetMetric(target: CoachingTarget, events: readonly KeystrokeEvent[], netWpm: number): { value: number, samples: number } | null {
    if (target.kind === "endurance") return { value: netWpm, samples: 1 }
    if (target.kind === "key") {
        const keys = new Set(target.keys.map((key) => key.toLocaleLowerCase()))
        const attempts = events.filter((event) => keys.has(event.key.toLocaleLowerCase()))
        if (target.metric === "accuracy") return attempts.length
            ? { value: attempts.filter((event) => event.correct).length / attempts.length * 100, samples: attempts.length }
            : null
        const arrivals = events.slice(1).flatMap((event, index) => {
            const delta = event.t - events[index]!.t
            return keys.has(event.key.toLocaleLowerCase()) && event.correct && delta > 0 && delta <= 2_000 ? [delta] : []
        })
        return arrivals.length ? { value: mean(arrivals), samples: arrivals.length } : null
    }
    if (target.kind === "transition") {
        const sample = sequences(events, target.pair)
        if (target.metric === "accuracy") return sample.count ? { value: sample.correct / sample.count * 100, samples: sample.count } : null
        return sample.values.length ? { value: mean(sample.values), samples: sample.values.length } : null
    }
    if (target.kind === "gram") {
        const sample = sequences(events, target.gram)
        return sample.values.length ? { value: mean(sample.values), samples: sample.values.length } : null
    }
    if (target.kind === "movement") {
        const values = target.anchors.flatMap((anchor) => sequences(events, anchor).values)
        return values.length ? { value: mean(values), samples: values.length } : null
    }
    if (target.kind === "correction") {
        const attempts = events.filter((event) => event.key.toLocaleLowerCase() === target.expected.toLocaleLowerCase())
        if (!attempts.length) return null
        const confusions = attempts.filter((event) => !event.correct && event.typed?.toLocaleLowerCase() === target.typed.toLocaleLowerCase()).length
        return { value: confusions / attempts.length * 100, samples: attempts.length }
    }

    const words: KeystrokeEvent[][] = []
    let current: KeystrokeEvent[] = []
    for (const event of events) {
        if (/^\p{L}$/u.test(event.key)) current.push(event)
        else if (current.length) { words.push(current); current = [] }
    }
    if (current.length) words.push(current)
    const targets = new Set(target.words.map((word) => word.toLocaleLowerCase()))
    const values: number[] = []
    let occurrences = 0
    for (const wordEvents of words) {
        const word = wordEvents.map((event) => event.key.toLocaleLowerCase()).join("")
        if (target.sharedGram) {
            const sample = sequences(wordEvents, target.sharedGram)
            values.push(...sample.values.map((value) => value / Math.max([...target.sharedGram!].length - 1, 1)))
            occurrences += sample.values.length
        } else if (targets.has(word) && wordEvents.every((event) => event.correct) && wordEvents.length > 1) {
            const duration = wordEvents[wordEvents.length - 1]!.t - wordEvents[0]!.t
            if (duration > 0 && duration <= 2_000 * (wordEvents.length - 1)) {
                values.push(duration / (wordEvents.length - 1))
                occurrences += 1
            }
        }
    }
    return values.length ? { value: mean(values), samples: occurrences } : null
}

function measure(prescription: FrozenRecommendation, context: "acquisition" | "transfer" | "cold", timeline: EncodedTimeline, netWpm: number) {
    const result = targetMetric(prescription.target, decodeTimeline(timeline), netWpm)
    const required = prescription.target.kind === "endurance" ? 1 : DRILL_SAMPLE_QUOTAS[context]
    if (!result || result.samples < required) return null
    const improved = prescription.direction === "lower"
        ? result.value <= prescription.baseline - prescription.minimumChange
        : result.value >= prescription.baseline + prescription.minimumChange
    return {
        targetSamples: result.samples,
        targetDelta: {
            label: targetDisplayLabel(prescription.target), before: prescription.baseline, after: result.value,
            unit: prescription.metric, direction: prescription.direction, improved,
        },
    } satisfies Pick<DailySet, "targetDelta" | "targetSamples">
}

export function measureDailyStepSet(
    session: DailyCoachingSession,
    step: DailyStep,
    run: { timeline: EncodedTimeline, netWpm: number },
): Pick<DailySet, "targetDelta" | "targetSamples"> | null {
    if (!step.target || (step.context !== "acquisition" && step.context !== "transfer" && step.context !== "cold")) return null
    if (session.prescription && sameCoachingTarget(step.target, session.prescription.target)) {
        return measure(session.prescription, step.context, run.timeline, run.netWpm)
    }
    if (step.context === "cold" && session.yesterday && sameCoachingTarget(step.target, session.yesterday.target)) {
        const cold: FrozenRecommendation = {
            id: `cold:${session.id}`, target: step.target, metric: session.yesterday.unit,
            direction: session.yesterday.unit === "ms" ? "lower" : "higher",
            baseline: session.yesterday.before, weaknessThreshold: session.yesterday.before,
            minimumChange: session.yesterday.minimumChange, impactMsPer1000: 0, confidence: 1,
            sampleCount: 0, distinctTests: 0, distinctWords: 0, reasonCode: "cold_check", reason: "Cold check", seenWords: [],
        }
        return measure(cold, "cold", run.timeline, run.netWpm)
    }
    return null
}
