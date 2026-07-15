import { describe, expect, it } from "vitest"
import { decodeEvidenceTimeline, encodeTimeline, type EncodedKeystroke } from "./keystrokes"
import { detectImpossibleTimeline, isRankableTimeline } from "./antiCheat"

function timelineFromGaps(gaps: number[]): EncodedKeystroke[] {
    return [[97, 1, 0], ...gaps.map((gap, index) => [98 + (index % 20), 1, gap] satisfies EncodedKeystroke)]
}

describe("detectImpossibleTimeline", () => {
    it("keeps human-paced timelines rankable", () => {
        const timeline = timelineFromGaps([110, 95, 130, 90, 160, 125, 105, 115, 140, 100, 155, 120, 135, 98, 145])

        expect(detectImpossibleTimeline(timeline)).toMatchObject({ impossible: false, reason: null })
        expect(isRankableTimeline(timeline)).toBe(true)
    })

    it("classifies equivalent v1 and v2 evidence identically", () => {
        const legacy = timelineFromGaps([110, 95, 130, 90, 160, 125, 105, 115, 140, 100, 155, 120])
        const current = encodeTimeline(decodeEvidenceTimeline(legacy))

        expect(detectImpossibleTimeline(current)).toEqual(detectImpossibleTimeline(legacy))
        expect(isRankableTimeline(current)).toBe(isRankableTimeline(legacy))
    })

    it("does not punish tiny samples", () => {
        const timeline = timelineFromGaps([0, 0, 0, 0, 0])

        expect(detectImpossibleTimeline(timeline)).toMatchObject({ impossible: false, reason: null })
    })

    it("flags too many same-millisecond gaps", () => {
        const timeline = timelineFromGaps([0, 0, 0, 0, 0, 0, 0, 0, 20, 25, 30, 35])

        expect(detectImpossibleTimeline(timeline)).toMatchObject({
            impossible: true,
            reason: "too_many_zero_gaps",
        })
    })

    it("flags sustained machine bursts", () => {
        const timeline = timelineFromGaps([3, 3, 2, 4, 4, 3, 3, 2, 4, 3, 80, 90])

        expect(detectImpossibleTimeline(timeline)).toMatchObject({
            impossible: true,
            reason: "sustained_machine_burst",
        })
    })

    it("flags machine-level average latency", () => {
        const timeline = timelineFromGaps(Array.from({ length: 30 }, (_, index) => index % 2 === 0 ? 10 : 12))

        expect(detectImpossibleTimeline(timeline)).toMatchObject({
            impossible: true,
            reason: "machine_average_latency",
        })
    })

    it("flags low-variance replay-like timelines", () => {
        const timeline = timelineFromGaps(Array.from({ length: 32 }, () => 24))

        expect(detectImpossibleTimeline(timeline)).toMatchObject({
            impossible: true,
            reason: "variance_floor",
        })
    })
})
