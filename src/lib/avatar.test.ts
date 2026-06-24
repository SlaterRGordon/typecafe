import { describe, expect, it } from "vitest"
import { avatarColor, avatarInitial } from "./avatar"

describe("avatarColor", () => {
    it("is stable for the same seed", () => {
        expect(avatarColor("testuser")).toBe(avatarColor("testuser"))
    })

    it("returns a valid hsl colour", () => {
        expect(avatarColor("alice")).toMatch(/^hsl\(\d{1,3}, 58%, 45%\)$/)
        expect(avatarColor("")).toMatch(/^hsl\(\d{1,3}, 58%, 45%\)$/)
    })

    it("spreads distinct seeds across different hues", () => {
        const hues = new Set(["alice", "bob", "carol", "dave", "erin"].map(avatarColor))
        expect(hues.size).toBeGreaterThan(1)
    })
})

describe("avatarInitial", () => {
    it("uppercases the first character", () => {
        expect(avatarInitial("alice")).toBe("A")
        expect(avatarInitial("Bob")).toBe("B")
    })

    it("ignores leading whitespace", () => {
        expect(avatarInitial("  carol")).toBe("C")
    })

    it("falls back to ? for missing or blank names", () => {
        expect(avatarInitial("")).toBe("?")
        expect(avatarInitial("   ")).toBe("?")
        expect(avatarInitial(null)).toBe("?")
        expect(avatarInitial(undefined)).toBe("?")
    })
})
