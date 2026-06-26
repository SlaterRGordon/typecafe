import { describe, expect, test } from "vitest"
import { buildKeyDrillPool, compileDrillText, rankDrillWords } from "./drill"

const steadyRng = () => 0
const cyclingRng = () => {
    let n = 0
    return () => ((n += 1) % 10) / 10
}

describe("rankDrillWords", () => {
    test("ranks real words by target-key density without requiring only target keys", () => {
        const ranked = rankDrillWords(["alphabet", "aaaaab", "bar", "bbb", "arc"], ["a"])

        expect(ranked.map((candidate) => candidate.word)).toEqual(["aaaaab", "arc", "bar", "alphabet"])
        expect(ranked).not.toContainEqual(expect.objectContaining({ word: "bbb" }))
    })
})

describe("compileDrillText", () => {
    test("generates key drills from real words that all contain a target key", () => {
        const text = compileDrillText({
            keys: ["x"],
            wordList: ["xenon", "box", "fix", "extra", "axis", "alpha"],
            length: 8,
            rng: cyclingRng(),
        })
        const words = text.split(" ")

        expect(words).toHaveLength(8)
        expect(words.every((word) => word.includes("x"))).toBe(true)
        expect(new Set(words).size).toBeGreaterThan(1)
        expect(words).not.toContain("xxxx")
    })

    test("represents every target key even when one is rare (regression: b,h,v,s,u dropped v)", () => {
        // Many dense common-key words would dominate a pure density ranking and
        // crowd out the only words carrying the rarer key 'v'.
        const wordList = ["hubs", "squash", "hush", "bus", "sub", "shush", "sushi", "bush", "have", "save", "above"]
        const keys = ["b", "h", "v", "s", "u"]
        const ranked = rankDrillWords(wordList, keys)
        const pool = buildKeyDrillPool(ranked, keys, 12)

        for (const key of keys) {
            expect(pool.some((word) => word.includes(key))).toBe(true)
        }
        // The compiled drill draws from that balanced pool, so 'v' actually shows up.
        const text = compileDrillText({ keys, wordList, length: 24, rng: cyclingRng() })
        expect(text.split(" ").some((word) => word.includes("v"))).toBe(true)
    })

    test("avoids immediate repeats when the candidate pool has alternatives", () => {
        const words = compileDrillText({
            keys: ["r"],
            wordList: ["rare", "array", "tread", "rest", "letter", "sound"],
            length: 12,
            rng: steadyRng,
        }).split(" ")

        for (let i = 1; i < words.length; i += 1) {
            expect(words[i]).not.toBe(words[i - 1])
        }
    })

    test("prefers words containing the requested transition", () => {
        const words = compileDrillText({
            transitions: ["br"],
            wordList: ["bring", "brave", "broom", "crab", "bar", "stone"],
            length: 6,
            rng: cyclingRng(),
        }).split(" ")

        expect(words.every((word) => word.includes("br"))).toBe(true)
        expect(new Set(words).size).toBeGreaterThan(1)
    })

    test("falls back to transition grams when matching words are scarce", () => {
        const words = compileDrillText({
            transitions: ["zx"],
            wordList: ["alpha", "omega"],
            length: 6,
            rng: cyclingRng(),
        }).split(" ")

        expect(words).toHaveLength(6)
        expect(words.every((word) => word.includes("zx"))).toBe(true)
        for (let i = 1; i < words.length; i += 1) {
            expect(words[i]).not.toBe(words[i - 1])
        }
    })

    test("drills a symbol transition via fallback grams (no English word has it)", () => {
        // 'e:' can't appear in any [a-z] word, so the drill must fall through to the
        // generated grams instead of stripping the colon away.
        const words = compileDrillText({
            transitions: ["e:"],
            wordList: ["alpha", "omega"],
            length: 6,
            rng: cyclingRng(),
        }).split(" ")

        expect(words).toHaveLength(6)
        expect(words.every((word) => word.includes("e:"))).toBe(true)
    })

    test("folds a capital transition onto its base letters", () => {
        const words = compileDrillText({
            transitions: ["tH"],
            wordList: ["this", "that", "math", "stone"],
            length: 6,
            rng: cyclingRng(),
        }).split(" ")

        expect(words.every((word) => word.includes("th"))).toBe(true)
    })

    test("terminates with key fallback tokens when no matching words exist", () => {
        const words = compileDrillText({
            keys: ["q"],
            wordList: ["alpha", "omega"],
            length: 5,
            rng: cyclingRng(),
        }).split(" ")

        expect(words).toHaveLength(5)
        expect(words.every((word) => word.includes("q"))).toBe(true)
    })
})
