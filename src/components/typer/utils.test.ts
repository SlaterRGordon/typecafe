import { describe, expect, it } from "vitest"
import { accentChars, applyTextOptions, ensureSizedLoaded, generateBetterPseudoText, generateNGram, generatePracticeText, generateText, getWords, rankNGrams } from "./utils"
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

    it("capitals-only caps just the leading word, no random mid-stream caps", () => {
        const input = Array.from({ length: 20 }, () => "word").join(" ")
        const output = applyTextOptions(input, false, true, { random: () => 0 })
        const capitalized = output.split(" ").map((word, index) => /^[A-Z]/.test(word) ? index : -1).filter((index) => index >= 0)
        expect(capitalized).toEqual([0])
    })

    it("with punctuation and capitals, capitalizes the first word", () => {
        const output = applyTextOptions("hello world", true, true)
        expect(output.charAt(0)).toBe("H")
    })

    it("drill marks restrict sprinkling to exactly the locked marks", () => {
        const input = "the quick brown fox jumps over the lazy dog and runs away fast now"
        const allowed = new Set([";", ":"])
        for (let i = 0; i < 30; i++) {
            const output = applyTextOptions(input, false, false, { marks: [";", ":"], targeted: true })
            for (const char of output.replace(/[a-z ]/g, "")) {
                expect(allowed.has(char)).toBe(true)
            }
        }
    })

    it("locked marks force punctuation even when the toggle is off", () => {
        // A '.' ender always closes the passage.
        const output = applyTextOptions("a b c d e f g h i j", false, false, { marks: ["."], targeted: true })
        expect(output.endsWith(".")).toBe(true)
    })

    it("drill digits inject only the locked digits as number tokens", () => {
        const input = Array.from({ length: 60 }, () => "word").join(" ")
        const allowed = new Set(["5", "7"])
        let sawDigit = false
        for (let i = 0; i < 20; i++) {
            const output = applyTextOptions(input, false, false, { digits: ["5", "7"], targeted: true })
            for (const char of output) {
                if (/[0-9]/.test(char)) {
                    sawDigit = true
                    expect(allowed.has(char)).toBe(true)
                }
            }
        }
        expect(sawDigit).toBe(true)
    })

    it("guarantees every targeted mark and digit", () => {
        const input = Array.from({ length: 40 }, (_, index) => `word${String.fromCharCode(97 + index % 20)}`).join(" ")
        const output = applyTextOptions(input, false, false, {
            marks: [";", ":", "!"],
            digits: ["2", "8"],
            targeted: true,
            random: () => 0.5,
        })
        for (const target of [";", ":", "!", "2", "8"]) expect(output).toContain(target)
        expect([...output].filter((character) => character === "2").length).toBeGreaterThanOrEqual(2)
        expect([...output].filter((character) => character === "8").length).toBeGreaterThanOrEqual(2)
    })

    it("numbers replace words and guarantee a numeric token in a short test", () => {
        const input = "one two three four five six seven eight nine ten"
        const output = applyTextOptions(input, false, false, { digits: "0123456789".split(""), random: () => 0.5 })
        expect(output.split(" ")).toHaveLength(input.split(" ").length)
        expect(output).toMatch(/\d/)
    })

    it("uses realistic numeric formats when punctuation is enabled", () => {
        const input = "one two three four five six seven eight nine ten"
        const output = applyTextOptions(input, true, false, { digits: "0123456789".split(""), random: () => 0.95 })
        expect(output).toMatch(/\d,\d{3}/)
    })

    it("capitalizes countries, states, initialisms, cities, weekdays and the pronoun I", () => {
        const output = applyTextOptions("travel from australia through texas to new york on monday with nasa and i", false, true, {
            language: "english",
            random: () => 0.5,
        })
        expect(output).toContain("Australia")
        expect(output).toContain("Texas")
        expect(output).toContain("NASA")
        expect(output).toContain("New York")
        expect(output).toContain("Monday")
        expect(output).toMatch(/\bI\b/)
    })

    it("uses Spanish opening punctuation and French punctuation spacing", () => {
        const input = Array.from({ length: 20 }, () => "palabra").join(" ")
        const spanish = applyTextOptions(input, true, true, { language: "spanish", random: () => 0.99 })
        expect(spanish).toMatch(/^¡/)
        expect(spanish).toContain("!")

        const french = applyTextOptions(input.replaceAll("palabra", "mot"), true, true, { language: "french", random: () => 0.99 })
        expect(french).toMatch(/ [;:?!]/)
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
            await ensureSizedLoaded(language, "10k")
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

describe("generatePracticeText", () => {
    it.each(["english", "french", "spanish", "german", "italian", "portuguese", "dutch", "polish"])(
        "mixes natural carriers with generated coverage in %s Practice text",
        async (language) => {
            await ensureSizedLoaded(language, "1k")
            const keys = "asdfghjkl".split("")
            const corpus = new Set(getWords(language).map((word) => word.toLowerCase().normalize("NFC")))
            const eligibleNaturalWords = getWords(language).slice(0, 5000).filter((word) =>
                word.length >= 3 && word.length <= 10 && [...word].every((character) => keys.includes(character)),
            )
            const words = generatePracticeText(40, keys, language).split(" ")

            expect(words).toHaveLength(40)
            expect(words.filter((word) => word.length < 3 || word.length > 10)).toEqual([])
            if (eligibleNaturalWords.length > 0) expect(words.some((word) => corpus.has(word))).toBe(true)
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
