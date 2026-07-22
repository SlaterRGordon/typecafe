import { describe, expect, it } from "vitest"
import { discoversWeakness, type EvidenceContext } from "./evidenceContext"
import type { GuestEvidenceTest } from "./guestEvidence"
import { boundedEvidenceWindow, normalizeGuestTimelineEvidence, normalizeStoredTimelineEvidence, type TimelineEvidence } from "./evidenceNormalization"
import { encodeTimeline } from "./keystrokes"

const timeline = encodeTimeline([
    { key: "t", typed: "t", correct: true, t: 0 },
    { key: "h", typed: "h", correct: true, t: 120 },
])

const guest: GuestEvidenceTest = {
    localId: "guest-1",
    completedAt: 1_752_500_000_000,
    context: "acquisition",
    config: {
        mode: 0,
        subMode: 1,
        count: 25,
        options: "",
        punctuation: false,
        capitals: false,
        numbers: false,
        layout: "qwertz-de",
        language: "english5k",
        utcOffsetMinutes: -420,
    },
    timeline,
}

const customPractice = {
    v: 1 as const,
    kind: "custom" as const,
    focus: { kind: "grams" as const, items: ["th", "ing"] },
    textStyle: "pseudo" as const,
    durationSeconds: 60 as const,
    elapsedActivityMs: 42_000,
    completed: false,
}

describe("Timeline evidence normalization", () => {
    it("normalizes equivalent guest and database fixtures identically", () => {
        const fromGuest = normalizeGuestTimelineEvidence(guest)
        const fromDatabase = normalizeStoredTimelineEvidence({
            createdAt: new Date(guest.completedAt),
            evidenceContext: guest.context,
            ranked: false,
            count: guest.config.count,
            options: guest.config.options,
            punctuation: guest.config.punctuation,
            capitals: guest.config.capitals,
            numbers: guest.config.numbers,
            layout: guest.config.layout,
            timeline,
            practice: undefined,
            type: { mode: 0, subMode: 1, language: "english" },
        })

        expect(fromDatabase).toEqual(fromGuest)
        expect(fromGuest).toMatchObject({ language: "english", pool: "qwerty", context: "acquisition" })
    })

    it("normalizes versioned Practice metadata identically for guest and signed-in evidence", () => {
        const practiceGuest: GuestEvidenceTest = {
            ...guest,
            context: "custom-practice",
            config: { ...guest.config, options: "" },
            practice: customPractice,
        }
        const fromGuest = normalizeGuestTimelineEvidence(practiceGuest)
        const fromDatabase = normalizeStoredTimelineEvidence({
            createdAt: new Date(practiceGuest.completedAt),
            evidenceContext: practiceGuest.context,
            ranked: false,
            count: practiceGuest.config.count,
            options: practiceGuest.config.options,
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: practiceGuest.config.layout,
            timeline,
            practice: customPractice,
            type: { mode: 0, subMode: 1, language: "english" },
        })

        expect(fromDatabase).toEqual(fromGuest)
        expect(fromGuest.practice).toEqual(customPractice)
    })

    it("bounds discovery, response, and Custom Practice separately", () => {
        const evidence = (context: EvidenceContext, completedAt: number): TimelineEvidence => ({
            ...normalizeGuestTimelineEvidence(guest),
            context,
            completedAt,
        })
        // 40 drills newer than 3 natural tests: a shared 30-cap would drop all
        // natural evidence; the split window must keep every natural timeline.
        const drills = Array.from({ length: 40 }, (_, index) => evidence("acquisition", 1_000 + index))
        const custom = Array.from({ length: 35 }, (_, index) => evidence("custom-practice", 2_000 + index))
        const natural = [evidence("natural", 1), evidence("natural", 2), evidence("diagnostic", 3)]

        const window = boundedEvidenceWindow([...drills, ...custom, ...natural], 30)

        expect(window.filter((item) => item.context === "acquisition")).toHaveLength(30)
        expect(window.filter((item) => item.context === "custom-practice")).toHaveLength(30)
        expect(window.filter((item) => discoversWeakness(item.context))).toHaveLength(3)
        expect(window.map((item) => item.completedAt)).toEqual([...window.map((item) => item.completedAt)].sort((a, b) => b - a))
    })

    it("keeps unclassified legacy evidence without granting it a proof context", () => {
        expect(normalizeStoredTimelineEvidence({
            createdAt: 1,
            evidenceContext: null,
            ranked: false,
            count: 30,
            options: "legacy-drill",
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: "qwerty",
            timeline,
            type: { mode: 0, subMode: 0, language: "english" },
            practice: null,
        }).context).toBeNull()
    })
})
