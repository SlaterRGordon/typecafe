import { describe, expect, it } from "vitest"
import { encodeTimeline } from "~/lib/keystrokes"
import { encodedTimelineSchema } from "../schemas/timeline"

describe("test.create timeline validation", () => {
    it("accepts legacy v1 and current v2 payloads", () => {
        expect(encodedTimelineSchema.safeParse([[97, 1, 0], [8, 2, 100]]).success).toBe(true)
        expect(encodedTimelineSchema.safeParse(encodeTimeline([
            { key: "a", typed: "x", correct: false, t: 0 },
            { action: "backspace", t: 50 },
            { key: "a", typed: "a", correct: true, t: 100 },
        ])).success).toBe(true)
    })

    it("rejects malformed and oversized v2 payloads", () => {
        expect(encodedTimelineSchema.safeParse({ v: 3, events: [] }).success).toBe(false)
        expect(encodedTimelineSchema.safeParse({ v: 2, events: [[0x110000, 0, 1, 0]] }).success).toBe(false)
        expect(encodedTimelineSchema.safeParse({ v: 2, events: [[97, 120, 1, 0]] }).success).toBe(false)
        expect(encodedTimelineSchema.safeParse({ v: 2, events: [[97, 120, 0, -1]] }).success).toBe(false)
        expect(encodedTimelineSchema.safeParse({ v: 2, events: [], extra: "not persisted" }).success).toBe(false)
        expect(encodedTimelineSchema.safeParse({
            v: 2,
            events: Array.from({ length: 50_001 }, () => [97, 0, 1, 10]),
        }).success).toBe(false)
    })
})
