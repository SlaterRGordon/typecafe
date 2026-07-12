import { describe, expect, it } from "vitest"
import { accentChars, applyTextOptions, ensureSizedLoaded, generateBetterPseudoText, generateNGram, generatePracticePseudoText, generateText, getWords, rankNGrams } from "./utils"
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
    // synchronous calls never return and the test run hangs - a loud failure.
    const adversarialKeySets = [
        ["b", "c", "d"], // no vowel - the reported crash
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

    it("draws real words from the requested language", async () => {
        await ensureSizedLoaded("french", "1k")
        // "oui" (o, u, i) is a common French word and absent from the English list,
        // so it can only appear if the generator pulled from the French words.
        const text = generateBetterPseudoText(40, ["o", "u", "i"], "french")
        expect(text.split(" ")).toContain("oui")
    })

    it.each(["english", "french", "spanish", "german", "italian", "portuguese", "dutch", "polish"])(
        "guarantees every active key in %s practice text",
        async (language) => {
            await ensureSizedLoaded(language, "1k")
            // Mirrors Practice's invariant: at least eight letters and two vowels.
            const keys = "asdfjklo".split("")
            const text = generateBetterPseudoText(40, keys, language)
            const words = text.split(" ")

            expect(words).toHaveLength(40)
            for (const key of keys) {
                expect([...text].filter((char) => char === key).length).toBeGreaterThanOrEqual(2)
                expect(words.some((word) => word.length > 1 && word.includes(key))).toBe(true)
            }
        },
    )
})

describe("generatePracticePseudoText", () => {
    it.each(["english", "french", "spanish", "german", "italian", "portuguese", "dutch", "polish"])(
        "uses only phonological pseudo-words for %s Practice text",
        async (language) => {
            await ensureSizedLoaded(language, "1k")
            const keys = "asdfghjkl".split("")
            const corpus = new Set(getWords(language).map((word) => word.toLowerCase().normalize("NFC")))
            const words = generatePracticePseudoText(40, keys, language).split(" ")

            expect(words).toHaveLength(40)
            expect(words.filter((word) => word.length <= 1 || corpus.has(word))).toEqual([])
            expect(words.every((word) => [...word].every((character) => keys.includes(character)))).toBe(true)
            for (const key of keys) {
                expect([...words.join("")].filter((character) => character === key).length).toBeGreaterThanOrEqual(2)
            }
        },
    )
})

describe("generateText", () => {
    it("never repeats a word back-to-back", () => {
        // Run many times: a doubled word reads as a typo and breaks flow.
        for (let i = 0; i < 50; i++) {
            const words = generateText(80, "english").split(" ")
            for (let j = 1; j < words.length; j++) {
                expect(words[j]).not.toBe(words[j - 1])
            }
        }
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

    it("derives its grams from the requested language", async () => {
        await ensureSizedLoaded("french", "1k")
        const topBigrams = (lang: string) => Array.from({ length: 10 }, (_, level) =>
            generateNGram(TestGramSources.bigrams, TestGramScopes.twoHundred, 1, 0, level, lang).trim())
        for (const gram of topBigrams("french")) expect(gram).toHaveLength(2)
        // Two languages don't share the same top-10 bigram ranking - proves French
        // grams are derived from the French words, not the English static list.
        expect(topBigrams("french")).not.toEqual(topBigrams("english"))
    })
})

describe("rankNGrams", () => {
    it("ranks character n-grams by frequency, most common first", () => {
        // "ou"/"ui" appear twice each; "no"/"on" once. Ties keep first-seen order.
        expect(rankNGrams(["oui", "oui", "non"], 2, 10)).toEqual(["ou", "ui", "no", "on"])
    })

    it("respects the limit and skips words shorter than n", () => {
        expect(rankNGrams(["ab", "abc", "a"], 3, 5)).toEqual(["abc"])
    })
})

describe("accentChars", () => {
    it("collects non-a-z letters ranked by frequency", () => {
        // é appears three times; ê and ł once each (ties keep first-seen order).
        expect(accentChars(["été", "école", "être", "łatwe"])).toEqual(["é", "ê", "ł"])
    })

    it("yields nothing for a plain-ascii (English) list", () => {
        expect(accentChars(["plain", "words", "only"])).toEqual([])
    })
})
