import { describe, expect, it } from "vitest"
import { drainSyncedAttempts, type CharAttempt } from "./practiceAttempts"

const mapOf = (entries: Record<string, CharAttempt>) => new Map(Object.entries(entries))

describe("drainSyncedAttempts", () => {
    it("subtracts exactly what synced and keeps the remainder (in-flight keystrokes survive)", () => {
        const attempts = mapOf({ a: { attempts: 10, correct: 8 } })
        drainSyncedAttempts(attempts, [{ character: "a", total: 6, correct: 5 }])
        expect(attempts.get("a")).toEqual({ attempts: 4, correct: 3 })
    })

    it("removes a key drained to exactly zero", () => {
        const attempts = mapOf({ a: { attempts: 6, correct: 6 } })
        drainSyncedAttempts(attempts, [{ character: "a", total: 6, correct: 6 }])
        expect(attempts.has("a")).toBe(false)
    })

    it("removes a key drained below zero", () => {
        const attempts = mapOf({ a: { attempts: 5, correct: 5 } })
        drainSyncedAttempts(attempts, [{ character: "a", total: 6, correct: 6 }])
        expect(attempts.has("a")).toBe(false)
    })

    it("clamps correct at zero when more correct synced than remain", () => {
        const attempts = mapOf({ a: { attempts: 10, correct: 2 } })
        drainSyncedAttempts(attempts, [{ character: "a", total: 4, correct: 4 }])
        expect(attempts.get("a")).toEqual({ attempts: 6, correct: 0 })
    })

    it("skips characters not in the map", () => {
        const attempts = mapOf({ a: { attempts: 3, correct: 3 } })
        drainSyncedAttempts(attempts, [{ character: "z", total: 1, correct: 1 }])
        expect(attempts.get("a")).toEqual({ attempts: 3, correct: 3 })
        expect(attempts.has("z")).toBe(false)
    })

    it("mutates the same map instance (concurrent writers see the drain)", () => {
        const attempts = mapOf({ a: { attempts: 8, correct: 8 } })
        const same = attempts
        drainSyncedAttempts(attempts, [{ character: "a", total: 3, correct: 3 }])
        expect(same.get("a")).toEqual({ attempts: 5, correct: 5 })
    })
})
