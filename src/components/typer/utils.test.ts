import { describe, expect, it, vi } from "vitest"
import { accentChars, applyTextOptions, ensureSizedLoaded, generateBetterPseudoText, generateText, getSizedWords } from "./utils"

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

describe("generateText", () => {
    it("emits the word a between neighboring generated words", () => {
        const words = getSizedWords("english", "1k")
        const randomValueForWord = (word: string) => (words.indexOf(word) + 0.5) / words.length
        const random = vi.spyOn(Math, "random")
            .mockReturnValueOnce(randomValueForWord("to"))
            .mockReturnValueOnce(randomValueForWord("a"))
            .mockReturnValueOnce(randomValueForWord("in"))

        try {
            expect(generateText(3, "english")).toBe("to a in")
        } finally {
            random.mockRestore()
        }
    })

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

describe("accentChars", () => {
    it("collects non-a-z letters ranked by frequency", () => {
        // é appears three times; ê and ł once each (ties keep first-seen order).
        expect(accentChars(["été", "école", "être", "łatwe"])).toEqual(["é", "ê", "ł"])
    })

    it("yields nothing for a plain-ascii (English) list", () => {
        expect(accentChars(["plain", "words", "only"])).toEqual([])
    })
})
