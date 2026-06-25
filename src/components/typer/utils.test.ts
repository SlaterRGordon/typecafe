import { describe, expect, it } from "vitest"
import { applyTextOptions, generateBetterPseudoText, generateNGram } from "./utils"
import { TestGramScopes, TestGramSources } from "./types"

const SENTENCE_ENDERS = [".", "?", "!"]

describe("applyTextOptions", () => {
    it("returns the text unchanged when both options are off", () => {
        expect(applyTextOptions("hello world", false, false)).toBe("hello world")
    })

    it("is a no-op on an empty string", () => {
        expect(applyTextOptions("", true, true)).toBe("")
    })

    it("always ends with a sentence ender when punctuation is on", () => {
        for (let i = 0; i < 20; i++) {
            const output = applyTextOptions("the quick brown fox jumps over the lazy dog", true, false)
            expect(SENTENCE_ENDERS).toContain(output.slice(-1))
        }
    })

    it("preserves the word count", () => {
        const input = "one two three four five six seven eight nine ten"
        const output = applyTextOptions(input, true, true)
        expect(output.split(" ")).toHaveLength(input.split(" ").length)
    })

    it("capitals-only capitalizes some words on a long enough text", () => {
        const input = Array.from({ length: 200 }, () => "word").join(" ")
        const output = applyTextOptions(input, false, true)
        const capitalized = output.split(" ").filter((w) => /^[A-Z]/.test(w))
        // ~20% expected; assert a generous band so the test is not flaky.
        expect(capitalized.length).toBeGreaterThan(10)
        expect(capitalized.length).toBeLessThan(120)
    })

    it("with punctuation and capitals, capitalizes the first word", () => {
        const output = applyTextOptions("hello world", true, true)
        expect(output.charAt(0)).toBe("H")
    })

    it("drill marks restrict sprinkling to exactly the locked marks", () => {
        const input = "the quick brown fox jumps over the lazy dog and runs away fast now"
        const allowed = new Set([";", ":"])
        for (let i = 0; i < 30; i++) {
            const output = applyTextOptions(input, false, false, { marks: [";", ":"] })
            for (const char of output.replace(/[a-z ]/g, "")) {
                expect(allowed.has(char)).toBe(true)
            }
        }
    })

    it("locked marks force punctuation even when the toggle is off", () => {
        // A '.' ender always closes the passage.
        const output = applyTextOptions("a b c d e f g h i j", false, false, { marks: ["."] })
        expect(output.endsWith(".")).toBe(true)
    })

    it("drill digits inject only the locked digits as number tokens", () => {
        const input = Array.from({ length: 60 }, () => "word").join(" ")
        const allowed = new Set(["5", "7"])
        let sawDigit = false
        for (let i = 0; i < 20; i++) {
            const output = applyTextOptions(input, false, false, { digits: ["5", "7"] })
            for (const char of output) {
                if (/[0-9]/.test(char)) {
                    sawDigit = true
                    expect(allowed.has(char)).toBe(true)
                }
            }
        }
        expect(sawDigit).toBe(true)
    })
})

describe("generateBetterPseudoText", () => {
    // Regression guard for the Practice freeze: a vowel-less (or otherwise
    // un-buildable) key set used to spin the word-builder forever, hanging the UI.
    // The generator must ALWAYS terminate for any key set. If this regresses, these
    // synchronous calls never return and the test run hangs — a loud failure.
    const adversarialKeySets = [
        ["b", "c", "d"], // no vowel — the reported crash
        ["b"],           // single consonant
        ["z"],           // single rare consonant
        ["q", "w"],      // consonants with no real words / few grams
        ["a"],           // single vowel
        [],              // empty
    ]

    for (const keys of adversarialKeySets) {
        it(`always terminates for keys [${keys.join(",")}]`, () => {
            expect(typeof generateBetterPseudoText(50, keys)).toBe("string")
        })
    }

    it("only emits the selected characters (plus spaces)", () => {
        const keys = ["e", "r", "t"]
        const allowed = new Set([...keys, " "])
        const text = generateBetterPseudoText(50, keys)
        for (const char of text) {
            expect(allowed.has(char)).toBe(true)
        }
    })

    it("produces real text from a vowel-containing key set", () => {
        const text = generateBetterPseudoText(30, ["a", "s", "d", "f"])
        expect(text.length).toBeGreaterThan(0)
        expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(30)
    })
})

describe("generateNGram", () => {
    const countWords = (text: string) => text.split(" ").filter(Boolean).length

    it("repetition grows the text linearly, not exponentially", () => {
        const base = countWords(generateNGram(TestGramSources.bigrams, TestGramScopes.fifty, 2, 0, 1))
        const repeated = countWords(generateNGram(TestGramSources.bigrams, TestGramScopes.fifty, 2, 3, 1))
        expect(base).toBe(2)
        expect(repeated).toBe(base * 4) // base + 3 repetitions
    })

    it("clamps very large repetition values", () => {
        const huge = generateNGram(TestGramSources.bigrams, TestGramScopes.fifty, 2, 1000, 1)
        expect(countWords(huge)).toBeLessThanOrEqual(2 * 20)
    })

    it("never includes 'undefined' for any level within the scope", () => {
        const combination = 2
        const totalLevels = Math.ceil(50 / combination)
        for (let level = 1; level < totalLevels - 1; level++) {
            const text = generateNGram(TestGramSources.bigrams, TestGramScopes.fifty, combination, 0, level)
            expect(text).not.toContain("undefined")
        }
    })
})
