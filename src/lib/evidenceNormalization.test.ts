import { describe, expect, it } from "vitest"
import type { GuestEvidenceTest } from "./guestEvidence"
import { normalizeGuestTimelineEvidence, normalizeStoredTimelineEvidence } from "./evidenceNormalization"
import { encodeTimeline } from "./keystrokes"

const timeline = encodeTimeline([
    { key: "t", typed: "t", correct: true, t: 0 },
    { key: "h", typed: "h", correct: true, t: 120 },
])

const guest: GuestEvidenceTest = {
    localId: "guest-1",
    completedAt: 1_752_500_000_000,
    context: "transfer",
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
            type: { mode: 0, subMode: 1, language: "english" },
        })

        expect(fromDatabase).toEqual(fromGuest)
        expect(fromGuest).toMatchObject({ language: "english", pool: "qwerty", context: "transfer" })
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
        }).context).toBeNull()
    })
})
