import { describe, expect, it } from "vitest"
import { drillCompatibilityDestination } from "./drillCompatibility"

describe("drillCompatibilityDestination", () => {
    it.each([
        [{ keys: "x,é" }, "target=key&keys=x,%C3%A9&metric=accuracy"],
        [{ transitions: "br" }, "target=transition&transitions=br&metric=latency"],
        [{ words: "rhythm,syzygy" }, "target=word&words=rhythm,syzygy"],
        [{ target: "gram", gram: "tion" }, "target=gram&gram=tion"],
        [{ target: "movement", movement: "row-reach", anchors: "fr,dr,sw,aq" }, "target=movement&movement=row-reach&anchors=fr,dr,sw,aq"],
        [{ target: "correction", correction: "q,x" }, "target=correction&correction=q,x"],
    ])("redirects a provable Target to Guided Practice", (query, expected) => {
        const destination = drillCompatibilityDestination(query)
        expect(destination).toMatch(/^\/practice\?/)
        expect(decodeURIComponent(destination)).toContain(decodeURIComponent(expected))
    })

    it("preserves policy, seen words, evidence, length, and re-measure compatibility context", () => {
        const evidence = JSON.stringify({ metric: "ms", baseline: 100, observed: 180, sampleCount: 8, reason: "Measured." })
        const destination = drillCompatibilityDestination({
            target: "gram",
            gram: "tion",
            policy: "cold",
            seen: "action,station",
            evidence,
            length: "30",
            rm: "opaque token",
        })
        const url = new URL(destination, "https://typecafe.test")
        expect(url.pathname).toBe("/practice")
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            target: "gram",
            gram: "tion",
            policy: "cold",
            seen: "action,station",
            evidence,
            length: "30",
            rm: "opaque token",
        })
    })

    it("routes endurance to its ordinary timed Home Test", () => {
        expect(drillCompatibilityDestination({ target: "endurance", shortSeconds: "30", longSeconds: "60", policy: "cold" }))
            .toBe("/?mode=timed&count=60&coaching=endurance&target=endurance&shortSeconds=30&longSeconds=60&policy=cold")
    })

    it("routes a legacy timed warm-up to an ordinary timed Home Test", () => {
        expect(drillCompatibilityDestination({ seconds: "15" })).toBe("/?mode=timed&count=15")
    })

    it("falls back to the truthful Practice landing when Target intent is absent or malformed", () => {
        expect(drillCompatibilityDestination({})).toBe("/practice")
        expect(drillCompatibilityDestination({ target: "gram", gram: "x" })).toBe("/practice")
    })
})
