import { describe, expect, it } from "vitest"
import { drillTargetToken } from "./coachingTarget"
import type { EvidenceContext } from "./evidenceContext"
import type { TimelineEvidence } from "./evidenceNormalization"
import { encodeTimeline, type TestEvidenceEvent } from "./keystrokes"
import { analyzeTypingEvidence, currentTimelineSupportsHigherOrderCandidate } from "./skillEvidence"

type PairSpec = { pair: string, gap: number, repeats: number, incorrectEvery?: number }
type WordSpec = { word: string, gaps: number[], repeats?: number }

function pairTimeline(testId: number, specs: PairSpec[], context: EvidenceContext = "natural"): TimelineEvidence {
    const events: TestEvidenceEvent[] = []
    let t = 0
    let occurrence = 0
    for (const spec of specs) {
        for (let repeat = 0; repeat < spec.repeats; repeat += 1) {
            const [from, to] = spec.pair
            t += 100
            events.push({ key: from!, typed: from!, correct: true, t })
            t += spec.gap
            occurrence += 1
            const correct = !spec.incorrectEvery || occurrence % spec.incorrectEvery !== 0
            events.push({ key: to!, typed: correct ? to! : "x", correct, t })
            t += 100
            events.push({ key: " ", typed: " ", correct: true, t })
        }
    }
    return {
        completedAt: 1_752_500_000_000 + testId,
        context,
        mode: 0,
        subMode: 0,
        count: 60,
        options: "",
        punctuation: false,
        capitals: false,
        numbers: false,
        layout: "qwerty",
        pool: "qwerty",
        language: "english",
        timeline: encodeTimeline(events),
    }
}

function baseline(repeats = 80): PairSpec[] {
    const gaps = [80, 100, 120]
    return gaps.map((gap, index) => ({
        pair: "th",
        gap,
        repeats: Math.floor(repeats / gaps.length) + (index < repeats % gaps.length ? 1 : 0),
    }))
}

function wordTimeline(testId: number, specs: WordSpec[]): TimelineEvidence {
    const events: TestEvidenceEvent[] = []
    let t = 0
    for (const spec of specs) {
        const characters = [...spec.word]
        for (let repeat = 0; repeat < (spec.repeats ?? 1); repeat += 1) {
            t += 100
            events.push({ key: characters[0]!, typed: characters[0]!, correct: true, t })
            for (let index = 1; index < characters.length; index += 1) {
                t += spec.gaps[index - 1]!
                events.push({ key: characters[index]!, typed: characters[index]!, correct: true, t })
            }
            t += 100
            events.push({ key: " ", typed: " ", correct: true, t })
        }
    }
    return {
        ...pairTimeline(testId, [], "natural"),
        timeline: encodeTimeline(events),
    }
}

const rhythmWords: WordSpec[] = [
    { word: "baba", gaps: [80, 100, 120], repeats: 10 },
]

function correctionTimeline(testId: number, episodes: number): TimelineEvidence {
    const events: TestEvidenceEvent[] = []
    let t = 0
    for (let index = 0; index < episodes; index += 1) {
        t += 100
        events.push({ key: "q", typed: "x", correct: false, t })
        t += 80
        events.push({ action: "backspace", t })
        t += 100
        events.push({ key: "q", typed: "q", correct: true, t })
        t += 100
        events.push({ key: " ", typed: " ", correct: true, t })
    }
    const normal = pairTimeline(testId, baseline(30)).timeline
    const normalEvents = "events" in normal ? normal.events : []
    const offset = t
    const decodedNormal = normalEvents.reduce<TestEvidenceEvent[]>((result, [expected, typed, state, dt]) => {
        t += dt
        if (state === 2) result.push({ action: "backspace", t })
        else {
            const key = String.fromCodePoint(expected)
            result.push({ key, typed: state === 1 ? key : String.fromCodePoint(typed), correct: state === 1, t })
        }
        return result
    }, [])
    return { ...pairTimeline(testId, [], "natural"), timeline: encodeTimeline([...events, ...decodedNormal]), completedAt: 1_752_500_000_000 + testId + offset }
}

function timedRun(
    testId: number,
    seconds: number,
    netWpm: number,
    options: Partial<Pick<TimelineEvidence, "punctuation" | "capitals" | "numbers" | "language" | "pool" | "options">> = {},
): TimelineEvidence {
    const characterCount = Math.round(netWpm * 5 * seconds / 60)
    const phrase = "the quick brown fox jumps over the lazy dog "
    const events: TestEvidenceEvent[] = []
    for (let index = 0; index < characterCount; index += 1) {
        const key = phrase[index % phrase.length]!
        events.push({ key, typed: key, correct: true, t: index * 20 })
    }
    return {
        ...pairTimeline(testId, []),
        count: seconds,
        ...options,
        timeline: encodeTimeline(events),
    }
}

describe("analyzeTypingEvidence", () => {
    it("ranks common cost above rarer raw slowness", () => {
        const timelines = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(),
            { pair: "br", gap: 140, repeats: 20 },
            { pair: "io", gap: 200, repeats: 4 },
        ]))

        const analysis = analyzeTypingEvidence({ timelines })
        const common = analysis.candidates.find((candidate) => candidate.id === "transition:latency:br")
        const rare = analysis.candidates.find((candidate) => candidate.id === "transition:latency:io")

        expect(common?.impactMsPer1000).toBeGreaterThan(rare?.impactMsPer1000 ?? Infinity)
        expect(analysis.recommendation?.id).toBe("transition:latency:br")
    })

    it("recommends a high-error pair even when its speed is normal", () => {
        const timelines = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(40),
            { pair: "br", gap: 100, repeats: 4, incorrectEvery: 2 },
        ]))

        const analysis = analyzeTypingEvidence({ timelines })

        expect(analysis.candidates.some((candidate) => candidate.id === "transition:latency:br")).toBe(false)
        expect(analysis.recommendation).toMatchObject({
            id: "transition:accuracy:br",
            target: { kind: "transition", pair: "br", metric: "accuracy" },
            reason: { code: "transition_error_rate_high" },
        })
    })

    it("never lets acquisition errors invent a natural weakness", () => {
        const natural = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(50),
            { pair: "br", gap: 100, repeats: 4 },
        ]))
        const acquisition = [3, 4].map((testId) => pairTimeline(testId, [
            { pair: "br", gap: 200, repeats: 10, incorrectEvery: 2 },
        ], "acquisition"))

        const analysis = analyzeTypingEvidence({ timelines: [...natural, ...acquisition] })

        expect(analysis.candidates.some((candidate) => candidate.id.includes(":br"))).toBe(false)
        expect(analysis.quality.acquisitionTimelines).toBe(2)
    })

    it("keeps acquisition response separate from the natural baseline", () => {
        const natural = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(40),
            { pair: "br", gap: 160, repeats: 4 },
        ]))
        const acquisition = {
            ...pairTimeline(3, [{ pair: "br", gap: 90, repeats: 8 }], "acquisition"),
            options: drillTargetToken({ kind: "transition", pair: "br", metric: "latency" }),
        }

        const candidate = analyzeTypingEvidence({ timelines: [...natural, acquisition] })
            .candidates.find((item) => item.id === "transition:latency:br")

        expect(candidate?.observed).toBe(160)
        expect(candidate?.response).toEqual({ context: "acquisition", value: 90, sampleCount: 8, runCount: 1 })
    })

    it("derives a chronological natural ability split from older vs newer tests", () => {
        const older = pairTimeline(1, [...baseline(40), { pair: "br", gap: 180, repeats: 4 }])
        const newer = pairTimeline(2, [...baseline(40), { pair: "br", gap: 140, repeats: 4 }])

        const candidate = analyzeTypingEvidence({ timelines: [older, newer] })
            .candidates.find((item) => item.id === "transition:latency:br")

        expect(candidate?.ability).toEqual({
            value: 160,
            sampleCount: 8,
            split: { earlier: 180, recent: 140, earlierSamples: 4, recentSamples: 4 },
        })
    })

    it("withholds the ability split when a chronological half is below the sample floor", () => {
        const older = pairTimeline(1, [...baseline(40), { pair: "br", gap: 180, repeats: 6 }])
        const newer = pairTimeline(2, [...baseline(40), { pair: "br", gap: 140, repeats: 3 }])

        const candidate = analyzeTypingEvidence({ timelines: [older, newer] })
            .candidates.find((item) => item.id === "transition:latency:br")

        expect(candidate?.ability?.split).toBeUndefined()
        expect(candidate?.ability?.sampleCount).toBe(9)
    })

    it("attributes drill volume only to the Target the drill was launched for", () => {
        const natural = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(40),
            { pair: "br", gap: 160, repeats: 4 },
        ]))
        // Both drills contain the br pair, but only one was launched for it: an
        // untagged legacy run and a run drilled for another Target count for
        // nothing and for their own Target respectively.
        const untagged = pairTimeline(3, [{ pair: "br", gap: 90, repeats: 8 }], "acquisition")
        const otherTarget = {
            ...pairTimeline(4, [{ pair: "br", gap: 90, repeats: 8 }], "acquisition"),
            options: drillTargetToken({ kind: "key", keys: ["q"], metric: "accuracy" }),
        }
        const forBr = {
            ...pairTimeline(5, [{ pair: "br", gap: 85, repeats: 6 }], "acquisition"),
            options: drillTargetToken({ kind: "transition", pair: "br", metric: "latency" }),
        }

        const candidate = analyzeTypingEvidence({ timelines: [...natural, untagged, otherTarget, forBr] })
            .candidates.find((item) => item.id === "transition:latency:br")

        expect(candidate?.response).toEqual({ context: "acquisition", value: 85, sampleCount: 6, runCount: 1 })
    })

    it("generates key latency and accuracy candidates", () => {
        const timelines = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(),
            { pair: "aq", gap: 160, repeats: 10, incorrectEvery: 5 },
            { pair: "eq", gap: 160, repeats: 10, incorrectEvery: 5 },
        ]))
        const candidates = analyzeTypingEvidence({ timelines }).candidates

        expect(candidates).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "key:latency:q" }),
            expect.objectContaining({ id: "key:accuracy:q" }),
        ]))
    })

    it("generates recurring correction confusion without double-counting final frequency", () => {
        const analysis = analyzeTypingEvidence({ timelines: [correctionTimeline(1, 2), correctionTimeline(2, 1)] })
        const candidate = analysis.candidates.find((item) => item.id === "correction:q:x")

        expect(candidate).toMatchObject({
            target: { kind: "correction", expected: "q", typed: "x" },
            sampleCount: 3,
            reason: { code: "correction_confusion_recurs", errors: 3 },
        })
        expect(candidate?.frequencyPer1000).toBeLessThanOrEqual(50)
    })

    it("excludes non-positive and interruption gaps and reports their quality flags", () => {
        const timeline = pairTimeline(1, [])
        timeline.timeline = encodeTimeline([
            { key: "b", typed: "b", correct: true, t: 0 },
            { key: "r", typed: "r", correct: true, t: 0 },
            { key: " ", typed: " ", correct: true, t: 100 },
            { key: "b", typed: "b", correct: true, t: 200 },
            { key: "r", typed: "r", correct: true, t: 3_200 },
        ])

        const quality = analyzeTypingEvidence({ timelines: [timeline] }).quality

        expect(quality.excludedNonPositiveGaps).toBe(1)
        expect(quality.excludedInterruptionGaps).toBe(1)
        expect(quality.interrupted).toBe(true)
    })

    it("uses the stable target id after cost, frequency, and confidence ties", () => {
        const timelines = [1, 2].map((testId) => pairTimeline(testId, [
            ...baseline(40),
            { pair: "br", gap: 160, repeats: 4 },
            { pair: "io", gap: 160, repeats: 4 },
        ]))

        const ordered = analyzeTypingEvidence({ timelines }).candidates
            .filter((candidate) => candidate.id.startsWith("transition:latency:"))
            .map((candidate) => candidate.id)

        expect(ordered.slice(0, 2)).toEqual(["transition:latency:br", "transition:latency:io"])
    })

    it("lets a common slow tetragram across varied words outrank its pairs", () => {
        const carriers = ["action", "station", "motion", "nation", "portion"]
        const timelines = [1, 2].map((testId) => wordTimeline(testId, [
            ...rhythmWords,
            ...carriers.map((word) => ({
                word,
                gaps: [...word].slice(1).map((_, index) => index >= [...word].length - 4 ? 160 : 100),
            })),
        ]))
        const corpusWords = [
            "action", "station", "motion", "nation", "portion", "question",
            "section", "option", "mention", "direction", "condition", "solution",
            "the", "and", "with", "from", "have", "this", "that", "your",
        ]

        const analysis = analyzeTypingEvidence({ timelines, corpusWords })

        expect(analysis.recommendation).toMatchObject({
            id: "gram:4:tion",
            target: { kind: "gram", gram: "tion" },
            reason: { code: "gram_internal_latency_high" },
        })
        expect(
            analysis.recommendation?.reason.code === "gram_internal_latency_high" &&
            carriers.every((word) => analysis.recommendation?.reason.code === "gram_internal_latency_high" && analysis.recommendation.reason.carrierWords.includes(word)),
        ).toBe(true)
        expect(analysis.recommendation?.observed).toBe(480)
        expect(analysis.recommendation?.baseline).toBe(300)
        expect(analysis.recommendation?.impactMsPer1000).toBeGreaterThan(
            analysis.candidates.find((candidate) => candidate.id === "transition:latency:ti")?.impactMsPer1000 ?? Infinity,
        )
    })

    it("requires the current score timeline to reproduce a historical higher-order weakness", () => {
        const carriers = ["action", "station", "motion", "nation", "portion"]
        const history = [1, 2].map((testId) => wordTimeline(testId, [
            ...rhythmWords,
            ...carriers.map((word) => ({
                word,
                gaps: [...word].slice(1).map((_, index) => index >= [...word].length - 4 ? 160 : 100),
            })),
        ]))
        const candidate = analyzeTypingEvidence({ timelines: history, corpusWords: carriers })
            .candidates.find((item) => item.id === "gram:4:tion")
        expect(candidate).toBeDefined()

        const unrelated = wordTimeline(3, [
            ...rhythmWords,
            { word: "quasar", gaps: [100, 100, 100, 100, 100], repeats: 3 },
        ])
        const cleanTarget = wordTimeline(4, [
            ...rhythmWords,
            { word: "action", gaps: [100, 100, 100, 100, 100], repeats: 3 },
        ])
        const slowTarget = wordTimeline(5, [
            ...rhythmWords,
            { word: "action", gaps: [100, 100, 160, 160, 160], repeats: 3 },
        ])

        expect(currentTimelineSupportsHigherOrderCandidate(candidate!, unrelated)).toBe(false)
        expect(currentTimelineSupportsHigherOrderCandidate(candidate!, cleanTarget)).toBe(false)
        expect(currentTimelineSupportsHigherOrderCandidate(candidate!, slowTarget)).toBe(true)
    })

    it("requires recurring words across Tests and filters interrupted samples", () => {
        const recurring = [
            wordTimeline(1, [...rhythmWords, { word: "quasar", gaps: [160, 160, 160, 160, 160], repeats: 2 }]),
            wordTimeline(2, [...rhythmWords, { word: "quasar", gaps: [160, 160, 160, 160, 160] }]),
        ]
        const oneOff = wordTimeline(3, [...rhythmWords, { word: "zephyr", gaps: [160, 160, 160, 160, 160] }])
        const interrupted = [1, 2].map((testId) => wordTimeline(10 + testId, [
            ...rhythmWords,
            { word: "action", gaps: [100, 100, 1_000, 160, 160], repeats: 3 },
        ]))

        const analysis = analyzeTypingEvidence({ timelines: [...recurring, oneOff, ...interrupted] })

        expect(analysis.candidates.some((candidate) => candidate.id === "word:quasar")).toBe(true)
        expect(analysis.candidates.some((candidate) => candidate.id === "word:zephyr")).toBe(false)
        expect(analysis.candidates.some((candidate) => candidate.id.includes("tion"))).toBe(false)
    })

    it("aggregates recurring hard words into a bounded shared-Gram family", () => {
        const words = ["action", "station", "motion", "nation", "portion", "section", "option"]
        const timelines = [1, 2].map((testId) => wordTimeline(testId, [
            { word: "baba", gaps: [80, 100, 120], repeats: 60 },
            ...words.map((word) => ({ word, gaps: [...word].slice(1).map(() => 150), repeats: 2 })),
        ]))

        const family = analyzeTypingEvidence({ timelines, corpusWords: words })
            .candidates.find((candidate) => candidate.id === "word:family:tion")

        expect(family).toMatchObject({
            target: { kind: "word", sharedGram: "tion" },
            reason: { code: "word_internal_latency_high", sharedGram: "tion" },
        })
        expect(family?.target.kind === "word" ? family.target.words : []).toHaveLength(6)
    })

    it("counts Unicode code points when forming overlapping Grams", () => {
        const timelines = [1, 2].map((testId) => wordTimeline(testId, [
            { word: "baba", gaps: [80, 100, 120], repeats: 50 },
            { word: "𝕒bca", gaps: [160, 160, 160], repeats: 3 },
            { word: "𝕒bcb", gaps: [160, 160, 160], repeats: 2 },
            { word: "𝕒bcc", gaps: [160, 160, 160], repeats: 2 },
        ]))

        const grams = analyzeTypingEvidence({ timelines }).candidates

        expect(grams.some((candidate) => candidate.id === "gram:3:𝕒bc")).toBe(true)
        expect(grams.filter((candidate) => candidate.target.kind === "gram").length)
            .toBeLessThanOrEqual(16)
    })

    it("requires four concrete sequences before reporting a slow prescribed movement", () => {
        const movements = [
            { pair: "fr", gap: 170, repeats: 8 },
            { pair: "de", gap: 170, repeats: 8 },
            { pair: "sw", gap: 170, repeats: 8 },
            { pair: "aq", gap: 170, repeats: 8 },
        ]
        const timelines = [1, 2].map((testId) => pairTimeline(testId, [...baseline(100), ...movements]))
        const candidate = analyzeTypingEvidence({ timelines }).candidates
            .find((item) => item.id === "movement:same-finger")

        expect(candidate).toMatchObject({
            target: { kind: "movement", movement: "same-finger" },
            sampleCount: 64,
            reason: { code: "movement_latency_high" },
        })
        expect(candidate?.target.kind === "movement" ? candidate.target.anchors : []).toHaveLength(4)

        const thin = [1, 2].map((testId) => pairTimeline(testId, [...baseline(100), ...movements.slice(0, 3)]))
        expect(analyzeTypingEvidence({ timelines: thin }).candidates.some((item) => item.target.kind === "movement")).toBe(false)
    })

    it("derives endurance only from matched short and long Test families", () => {
        const matched = [
            ...[1, 2, 3].map((id) => timedRun(id, 30, 60)),
            ...[4, 5, 6].map((id) => timedRun(id, 60, 45)),
        ]
        const endurance = analyzeTypingEvidence({ timelines: matched }).candidates
            .find((item) => item.target.kind === "endurance")

        expect(endurance).toMatchObject({
            target: { kind: "endurance", shortSeconds: 30, longSeconds: 60 },
            metric: "wpm",
            observed: 45,
            baseline: 60,
            reason: { code: "endurance_fade", gapWpm: 15 },
        })

        const unmatched = [
            ...matched.slice(0, 3),
            timedRun(4, 60, 45, { options: "different-family" }),
            timedRun(5, 60, 45, { language: "french" }),
            timedRun(6, 60, 45, { pool: "colemak" }),
        ]
        expect(analyzeTypingEvidence({ timelines: unmatched }).candidates.some((item) => item.target.kind === "endurance")).toBe(false)
    })

    it("computes punctuation, capital, and number costs only from matched families", () => {
        const timelines: TimelineEvidence[] = []
        let id = 1
        for (const kind of ["punctuation", "capitals", "numbers"] as const) {
            for (let repeat = 0; repeat < 3; repeat += 1) {
                timelines.push(timedRun(id++, 30, 60, { options: kind }))
                timelines.push(timedRun(id++, 30, kind === "punctuation" ? 48 : kind === "capitals" ? 50 : 52, {
                    options: kind,
                    [kind]: true,
                }))
            }
        }

        expect(analyzeTypingEvidence({ timelines }).testFamilyCosts).toEqual([
            expect.objectContaining({ kind: "punctuation", gapWpm: 12, baselineTests: 3, enabledTests: 3 }),
            expect.objectContaining({ kind: "capitals", gapWpm: 10, baselineTests: 3, enabledTests: 3 }),
            expect.objectContaining({ kind: "numbers", gapWpm: 8, baselineTests: 3, enabledTests: 3 }),
        ])
    })
})
