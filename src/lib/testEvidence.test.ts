import { describe, expect, it } from "vitest"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import { evaluateTestEvidence } from "./testEvidence"

type EvidenceInput = { key: string, correct: boolean } | { action: "backspace" }

function evidence(events: EvidenceInput[], gapMs = 200) {
    const timedEvents: TestEvidenceEvent[] = events.map((event, index) => (
        "action" in event
            ? { action: "backspace", t: index * gapMs }
            : { ...event, t: index * gapMs }
    ))
    return encodeTimeline(timedEvents)
}

describe("evaluateTestEvidence", () => {
    it("derives saved metrics from the final replay state", () => {
        const timeline = evidence(Array.from({ length: 50 }, (_, index) => ({
            key: String.fromCharCode(97 + index % 20),
            correct: index < 45,
        })))

        const result = evaluateTestEvidence({ timeline, durationSeconds: 10, eligibleForRanking: true })

        expect(result.speed).toBe(60)
        expect(result.accuracy).toBe(90)
        expect(result.netWpm).toBe(48)
        expect(result.score).toBe(48)
        expect(result.ranked).toBe(true)
    })

    it("replays backspaces before deriving final counts and accuracy", () => {
        const timeline = evidence([
            { key: "a", correct: false },
            { action: "backspace" },
            { key: "a", correct: true },
            { key: "b", correct: true },
        ])

        const result = evaluateTestEvidence({ timeline, durationSeconds: 2, eligibleForRanking: false })

        expect(result.characterCount).toBe(2)
        expect(result.incorrectCount).toBe(0)
        expect(result.accuracy).toBe(100)
    })

    it("keeps a word test unranked when its final prompt length does not match", () => {
        const timeline = evidence("one two three four five six seven eight nine ten".split("").map((key) => ({ key, correct: true })))

        expect(evaluateTestEvidence({
            timeline,
            durationSeconds: 10,
            eligibleForRanking: true,
            expectedWordCount: 25,
        }).ranked).toBe(false)
    })
})
