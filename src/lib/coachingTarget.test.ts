import { describe, expect, it } from "vitest"
import {
    drillTargetToken,
    parseCoachingTargetQuery,
    parseDrillTargetToken,
    targetAccuracyPolicy,
    targetAction,
    targetDisplayLabel,
    type CoachingTarget,
} from "./coachingTarget"

describe("coaching target query adapter", () => {
    it("keeps legacy key, Transition, and word links readable", () => {
        expect(parseCoachingTargetQuery({ keys: "x,é" })).toMatchObject({
            target: { kind: "key", keys: ["x", "é"], metric: "accuracy" },
            policy: "acquisition",
            legacy: true,
        })
        expect(parseCoachingTargetQuery({ transitions: "e:" })).toMatchObject({
            target: { kind: "transition", pair: "e:", metric: "latency" },
            legacy: true,
        })
        expect(parseCoachingTargetQuery({ words: "Rhythm,syzygy" })).toMatchObject({
            target: { kind: "word", words: ["rhythm", "syzygy"] },
            legacy: true,
        })
    })

    it("round-trips a frozen movement target, policy, and seen carriers", () => {
        const target: CoachingTarget = { kind: "movement", movement: "row-reach", anchors: ["fr", "de", "sw", "aq"] }
        const action = targetAction(target, "cold", { seenWords: ["from", "desk"] })
        const url = new URL(action.href, "https://typecafe.test")
        const query = Object.fromEntries(url.searchParams)

        expect(parseCoachingTargetQuery(query)).toEqual({
            target,
            policy: "cold",
            seenWords: ["from", "desk"],
            legacy: false,
        })
        expect(action.label).toBe("Practice this movement")
        expect(targetDisplayLabel(target)).toBe("this movement")
    })

    it("hands endurance to the matched normal Test surface", () => {
        const action = targetAction({ kind: "endurance", shortSeconds: 30, longSeconds: 60 }, "transfer")
        expect(action).toMatchObject({ surface: "test", label: "Check endurance" })
        expect(action.href).toContain("/?mode=timed&count=60")
        expect(action.href).toContain("shortSeconds=30&longSeconds=60&policy=transfer")
    })

    it("round-trips every target kind through the persisted drill token and stays within the options cap", () => {
        const targets: CoachingTarget[] = [
            { kind: "key", keys: ["e", "é"], metric: "latency" },
            { kind: "transition", pair: "br", metric: "accuracy" },
            { kind: "gram", gram: "ing" },
            { kind: "word", words: ["together", "thought", "through", "whether", "weather", "brother"], sharedGram: "ther" },
            { kind: "movement", movement: "same-finger", anchors: ["fr", "de", "sw", "aq", "lo", "ki", "ju", "hy"] },
            { kind: "correction", expected: "q", typed: "x" },
        ]
        for (const target of targets) {
            const token = drillTargetToken(target)
            expect(token.length).toBeLessThanOrEqual(250)
            expect(parseDrillTargetToken(token)).toEqual(target)
        }
        expect(parseDrillTargetToken("")).toBeNull()
        expect(parseDrillTargetToken("Level 3")).toBeNull()
        expect(parseDrillTargetToken("target:{broken")).toBeNull()
        expect(parseDrillTargetToken('target:{"kind":"key","keys":[],"metric":"latency"}')).toBeNull()
    })

    it("uses a no-rush perfect-accuracy policy for inaccurate transitions and corrections", () => {
        expect(targetAccuracyPolicy({ kind: "transition", pair: "th", metric: "accuracy" })).toEqual({ goalPct: 100, noRush: true })
        expect(targetAccuracyPolicy({ kind: "correction", expected: "q", typed: "x" })).toEqual({ goalPct: 100, noRush: true })
        expect(targetAccuracyPolicy({ kind: "transition", pair: "th", metric: "latency" })).toBeNull()
    })
})
