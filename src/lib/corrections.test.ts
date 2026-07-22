import { describe, expect, it } from "vitest"
import { correctionEpisodes } from "./corrections"
import { decodeEvidenceTimeline, encodeTimeline, type EncodedTimeline } from "./keystrokes"

describe("correctionEpisodes", () => {
    it("derives confusion, reaction time, and total correction cost", () => {
        const events = decodeEvidenceTimeline(encodeTimeline([
            { key: "a", typed: "x", correct: false, t: 100 },
            { action: "backspace", t: 180 },
            { key: "a", typed: "a", correct: true, t: 260 },
        ]))

        expect(correctionEpisodes(events)).toEqual([{
            expected: "a",
            typed: "x",
            errorAt: 0,
            firstBackspaceAt: 80,
            correctedAt: 160,
            backspaces: 1,
            reactionTimeMs: 80,
            costMs: 160,
        }])
    })

    it("handles repeated Backspaces and over-correction before repairing the miss", () => {
        const events = decodeEvidenceTimeline(encodeTimeline([
            { key: "a", typed: "a", correct: true, t: 100 },
            { key: "b", typed: "x", correct: false, t: 200 },
            { action: "backspace", t: 250 },
            { action: "backspace", t: 300 },
            { key: "a", typed: "a", correct: true, t: 350 },
            { key: "b", typed: "b", correct: true, t: 450 },
        ]))

        expect(correctionEpisodes(events)).toMatchObject([{
            expected: "b",
            typed: "x",
            backspaces: 2,
            reactionTimeMs: 50,
            costMs: 250,
        }])
    })

    it("supports first-key errors and Unicode confusions", () => {
        const events = decodeEvidenceTimeline(encodeTimeline([
            { key: "é", typed: "😀", correct: false, t: 10 },
            { action: "backspace", t: 30 },
            { key: "é", typed: "é", correct: true, t: 60 },
        ]))
        expect(correctionEpisodes(events)[0]).toMatchObject({ expected: "é", typed: "😀", costMs: 50 })
    })

    it("keeps impossible clock movement from producing negative timings", () => {
        const events = [
            { key: "a", typed: "x", correct: false, t: 100 },
            { action: "backspace" as const, t: 90 },
            { key: "a", typed: "a", correct: true, t: 80 },
        ]
        expect(correctionEpisodes(events)[0]).toMatchObject({ reactionTimeMs: 0, costMs: 0 })
    })

    it("does not invent confusion evidence from mixed v1/v2 history", () => {
        const timelines: EncodedTimeline[] = [
            [[97, 0, 0], [8, 2, 50], [97, 1, 50]],
            encodeTimeline([
                { key: "b", typed: "x", correct: false, t: 0 },
                { action: "backspace", t: 50 },
                { key: "b", typed: "b", correct: true, t: 100 },
            ]),
        ]
        const episodes = timelines.flatMap((timeline) => correctionEpisodes(decodeEvidenceTimeline(timeline)))
        expect(episodes).toHaveLength(1)
        expect(episodes[0]).toMatchObject({ expected: "b", typed: "x" })
    })

    it("does not count an uncorrected error or a deletion without a replacement", () => {
        expect(correctionEpisodes([
            { key: "a", typed: "x", correct: false, t: 0 },
        ])).toEqual([])
        expect(correctionEpisodes([
            { key: "a", typed: "x", correct: false, t: 0 },
            { action: "backspace", t: 10 },
        ])).toEqual([])
    })
})
