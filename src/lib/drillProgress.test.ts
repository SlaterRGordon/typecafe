import { describe, expect, it } from "vitest"
import {
    attemptsFromEvents,
    keyDrillDelta,
    keysBaseline,
    mergeAttempts,
    nextDrillFinding,
    transitionBaseline,
    transitionDrillDelta,
    type KeyAttempts,
} from "./drillProgress"
import type { KeystrokeEvent } from "./keystrokes"
import type { TransitionAggregate } from "./transitions"

function events(spec: Array<[key: string, correct: boolean, dtMs: number]>): KeystrokeEvent[] {
    let t = 0
    return spec.map(([key, correct, dtMs]) => {
        t += dtMs
        return { key, typed: correct ? key : "?", correct, t }
    })
}

function agg(pair: string, count: number, meanMs: number, errors = 0): TransitionAggregate {
    return { pair, count, totalMs: count * meanMs, errors }
}

function attempts(spec: Array<[key: string, attempts: number, correct: number]>): KeyAttempts {
    return new Map(spec.map(([key, a, c]) => [key, { attempts: a, correct: c }]))
}

describe("nextDrillFinding", () => {
    // A slow pair needs count >= 4 and ratio >= 1.3 vs the overall mean; "th"
    // bulk keeps the baseline low so "br"/"io" qualify.
    const transitions = [agg("th", 40, 100), agg("br", 10, 400), agg("io", 10, 300)]
    const weakAttempts = attempts([["q", 10, 5], ["z", 10, 7], ["e", 10, 10]])

    it("prefers the slowest transition", () => {
        const finding = nextDrillFinding(transitions, weakAttempts)
        expect(finding).toMatchObject({ kind: "transition", pair: "br", id: "transition:br", href: "/drill?transitions=br" })
    })

    it("skips excluded pairs and picks the next-worst", () => {
        const finding = nextDrillFinding(transitions, new Map(), { pairs: ["br"] })
        expect(finding).toMatchObject({ kind: "transition", pair: "io" })
    })

    it("falls back to weak keys when no transition is left", () => {
        const finding = nextDrillFinding([], weakAttempts)
        expect(finding).toMatchObject({ kind: "keys", keys: ["q", "z"], id: "keys:q,z", href: "/drill?keys=q,z" })
    })

    it("excludes just-drilled keys from the fallback", () => {
        const finding = nextDrillFinding([], weakAttempts, { keys: ["q"] })
        expect(finding).toMatchObject({ kind: "keys", keys: ["z"] })
    })

    it("returns null with no evidence left", () => {
        expect(nextDrillFinding([], new Map())).toBeNull()
        expect(nextDrillFinding([], weakAttempts, { keys: ["q", "z"] })).toBeNull()
    })
})

describe("attemptsFromEvents", () => {
    it("counts attempts and correct hits per expected key", () => {
        const map = attemptsFromEvents(events([["a", true, 0], ["a", false, 100], ["b", true, 100]]))
        expect(map.get("a")).toEqual({ attempts: 2, correct: 1 })
        expect(map.get("b")).toEqual({ attempts: 1, correct: 1 })
    })
})

describe("mergeAttempts", () => {
    it("sums lifetime stats with rep attempts", () => {
        const merged = mergeAttempts(
            [{ key: "a", attempts: 10, correct: 8 }],
            attempts([["a", 2, 2], ["b", 1, 0]]),
        )
        expect(merged.get("a")).toEqual({ attempts: 12, correct: 10 })
        expect(merged.get("b")).toEqual({ attempts: 1, correct: 0 })
    })
})

describe("transitionBaseline", () => {
    it("returns the pair's lifetime mean and ratio vs overall pace", () => {
        const base = transitionBaseline("br", [agg("br", 10, 400), agg("th", 30, 100)])
        // Overall mean = (4000 + 3000) / 40 = 175.
        expect(base?.meanMs).toBe(400)
        expect(base?.ratio).toBeCloseTo(400 / 175)
    })

    it("null when the pair lacks lifetime samples", () => {
        expect(transitionBaseline("br", [agg("br", 3, 400)])).toBeNull()
        expect(transitionBaseline("br", [])).toBeNull()
    })
})

describe("keysBaseline", () => {
    it("sums accuracy across the drilled keys only", () => {
        const base = keysBaseline(["q", "z"], [
            { key: "q", attempts: 10, correct: 5 },
            { key: "z", attempts: 10, correct: 7 },
            { key: "e", attempts: 100, correct: 100 },
        ])
        expect(base?.accuracy).toBe(60)
    })

    it("null below the minimum lifetime attempts", () => {
        expect(keysBaseline(["q"], [{ key: "q", attempts: 9, correct: 9 }])).toBeNull()
    })
})

describe("transitionDrillDelta", () => {
    // Rep: three b→r gaps of 200ms each.
    const rep = events([["b", true, 0], ["r", true, 200], ["b", true, 500], ["r", true, 200], ["b", true, 500], ["r", true, 200]])

    it("compares lifetime mean vs this rep", () => {
        const delta = transitionDrillDelta("br", [agg("br", 10, 400)], rep)
        expect(delta).toMatchObject({ label: "b→r", before: 400, after: 200, unit: "ms", improved: true })
    })

    it("a slower rep is not an improvement", () => {
        const delta = transitionDrillDelta("br", [agg("br", 10, 150)], rep)
        expect(delta?.improved).toBe(false)
    })

    it("null when the lifetime baseline is too thin", () => {
        expect(transitionDrillDelta("br", [agg("br", 3, 400)], rep)).toBeNull()
        expect(transitionDrillDelta("br", [], rep)).toBeNull()
    })

    it("null when the rep barely hit the pair", () => {
        const thin = events([["b", true, 0], ["r", true, 200]])
        expect(transitionDrillDelta("br", [agg("br", 10, 400)], thin)).toBeNull()
    })
})

describe("keyDrillDelta", () => {
    const lifetime = [
        { key: "q", attempts: 10, correct: 5 },
        { key: "z", attempts: 10, correct: 7 },
        { key: "e", attempts: 100, correct: 100 },
    ]
    const rep = events([["q", true, 0], ["q", true, 100], ["z", true, 100], ["z", false, 100]])

    it("aggregates accuracy across the drilled keys only", () => {
        const delta = keyDrillDelta(["q", "z"], lifetime, rep)
        // Lifetime 12/20 = 60%; rep 3/4 = 75%.
        expect(delta).toMatchObject({ label: "q z", before: 60, after: 75, unit: "%", improved: true })
    })

    it("a flat rep is not an improvement", () => {
        const flat = events([["q", true, 0], ["q", false, 100], ["z", true, 100], ["z", false, 100], ["q", true, 100]])
        const delta = keyDrillDelta(["q", "z"], lifetime, flat)
        expect(delta?.improved).toBe(false)
    })

    it("null when lifetime or rep evidence is too thin", () => {
        expect(keyDrillDelta(["q"], [{ key: "q", attempts: 5, correct: 5 }], rep)).toBeNull()
        expect(keyDrillDelta(["z"], lifetime, events([["z", true, 0]]))).toBeNull()
    })
})
