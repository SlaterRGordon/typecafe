import { describe, expect, it } from "vitest"
import { encodeTimeline } from "./keystrokes"
import type { GuestEvidenceTest } from "./guestEvidence"
import { drillTargetToken } from "./coachingTarget"
import { createGuestEvidenceStore, type GuestEvidenceStorage } from "./guestEvidenceStore"

function evidence(localId: string, completedAt: number, context: GuestEvidenceTest["context"] = "natural"): GuestEvidenceTest {
    return {
        localId,
        completedAt,
        context,
        config: {
            mode: 0,
            subMode: 1,
            count: 1,
            options: "",
            punctuation: false,
            capitals: false,
            numbers: false,
            layout: "qwerty",
            language: "english",
            utcOffsetMinutes: -420,
        },
        timeline: encodeTimeline([{ key: "a", typed: "a", correct: true, t: 0 }]),
    }
}

function memoryStorage(initial: unknown[] = []) {
    let items = structuredClone(initial)
    const storage: GuestEvidenceStorage = {
        load: () => Promise.resolve(structuredClone(items)),
        replace: (next) => {
            items = structuredClone(next)
            return Promise.resolve()
        },
    }
    return { storage, raw: () => items }
}

describe("guest evidence store", () => {
    it("validates records and degrades to an empty mirror when storage is unavailable", async () => {
        const memory = memoryStorage([evidence("valid", 1), { localId: "broken" }])
        const store = createGuestEvidenceStore(memory.storage)
        expect((await store.read()).map((item) => item.localId)).toEqual(["valid"])
        expect(memory.raw()).toHaveLength(1)

        const unavailable = createGuestEvidenceStore({
            load: () => Promise.reject(new Error("blocked")),
            replace: () => Promise.reject(new Error("blocked")),
        })
        expect(await unavailable.read()).toEqual([])
        expect(await unavailable.add(evidence("lost", 2))).toBe(false)
    })

    it("retains at most 200 newest records and evicts old natural Tests before Coaching evidence", async () => {
        const memory = memoryStorage()
        const store = createGuestEvidenceStore(memory.storage)
        await store.add(evidence("coaching", 0, "acquisition"))
        for (let i = 1; i <= 200; i++) await store.add(evidence(`natural-${i}`, i))

        const items = await store.read()
        expect(items).toHaveLength(200)
        expect(items.some((item) => item.localId === "coaching")).toBe(true)
        expect(items.some((item) => item.localId === "natural-1")).toBe(false)
        expect(items.at(-1)?.localId).toBe("natural-200")
    })

    it("enforces the 20MB cap even before the count cap", async () => {
        const largeTimeline: GuestEvidenceTest["timeline"] = {
            v: 2,
            events: Array.from({ length: 50_000 }, () => [0x10ffff, 0x10ffff, 0, 86_400_000] as [number, number, 0, number]),
        }
        const oversized = Array.from({ length: 16 }, (_, index) => ({
            ...evidence(`large-${index}`, index),
            timeline: largeTimeline,
        }))
        const memory = memoryStorage(oversized)
        const store = createGuestEvidenceStore(memory.storage)

        const items = await store.read()
        expect(items.length).toBeLessThan(oversized.length)
        expect(items.at(-1)?.localId).toBe("large-15")
        expect(items.some((item) => item.localId === "large-0")).toBe(false)
    })

    it("replaces duplicate local ids and deletes only confirmed ids", async () => {
        const memory = memoryStorage([evidence("first", 1), evidence("second", 2)])
        const store = createGuestEvidenceStore(memory.storage)
        await store.add(evidence("first", 3, "acquisition"))
        await store.remove(["second"])

        const items = await store.read()
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({ localId: "first", completedAt: 3, context: "acquisition" })
    })

    it("round-trips Guided and Custom Practice metadata without accepting false attribution", async () => {
        const target = { kind: "transition" as const, pair: "th", metric: "latency" as const }
        const guided: GuestEvidenceTest = {
            ...evidence("guided", 1, "acquisition"),
            config: { ...evidence("guided", 1).config, options: drillTargetToken(target) },
            practice: {
                v: 1,
                kind: "guided",
                focus: { kind: "grams", items: ["th"] },
                textStyle: "varied",
                durationSeconds: 60,
                elapsedActivityMs: 60_000,
                completed: true,
                target,
            },
        }
        const custom: GuestEvidenceTest = {
            ...evidence("custom", 2, "custom-practice"),
            practice: {
                v: 1,
                kind: "custom",
                focus: { kind: "keys", items: ["q", "x"] },
                textStyle: "pseudo",
                durationSeconds: 120,
                elapsedActivityMs: 31_000,
                completed: false,
            },
        }
        const memory = memoryStorage()
        const store = createGuestEvidenceStore(memory.storage)

        expect(await store.add(guided)).toBe(true)
        expect(await store.add(custom)).toBe(true)
        expect(await store.add({ ...guided, config: { ...guided.config, options: "" } })).toBe(false)
        expect(await store.read()).toEqual([guided, custom])
    })
})
