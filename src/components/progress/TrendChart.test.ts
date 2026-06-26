import { describe, expect, it } from "vitest"
import { extendToEdges } from "./TrendChart"

describe("extendToEdges", () => {
    it("extrapolates the end segments out to both edges along their slope", () => {
        // Slope 1 (y = x): inset points at x=2 and x=8 extend to x=0 and x=10.
        const out = extendToEdges([{ x: 2, y: 2 }, { x: 8, y: 8 }], 0, 10)
        expect(out[0]).toEqual({ x: 0, y: 0 })
        expect(out[out.length - 1]).toEqual({ x: 10, y: 10 })
    })

    it("keeps interior points and uses only the end segments' slopes", () => {
        // A bend in the middle: left edge follows the first segment, right edge the last.
        const out = extendToEdges([{ x: 2, y: 0 }, { x: 4, y: 4 }, { x: 6, y: 5 }], 0, 10)
        expect(out[0]).toEqual({ x: 0, y: -4 }) // slope 2 back from (2,0)
        expect(out[out.length - 1]).toEqual({ x: 10, y: 7 }) // slope 0.5 fwd from (6,5)
        expect(out.slice(1, -1)).toEqual([{ x: 2, y: 0 }, { x: 4, y: 4 }, { x: 6, y: 5 }])
    })

    it("returns the input unchanged when there's nothing to extend", () => {
        expect(extendToEdges([{ x: 5, y: 5 }], 0, 10)).toEqual([{ x: 5, y: 5 }])
    })
})
