import { describe, expect, it } from "vitest"
import english10k from "~/components/typer/languages/english10k.json"
import { generateRestrictedText } from "./restrictedText"

const cyclingRng = () => {
    let value = 0
    return () => {
        value = (value + 0.271828) % 1
        return value
    }
}

const occurrences = (text: string, target: string): number =>
    [...text].filter((char) => char === target).length

const generate = (corpus: readonly string[], characters: string[], count: number, language = "english") =>
    generateRestrictedText({ language, words: corpus, characters, count, rng: cyclingRng() })

describe("generateRestrictedText", () => {
    it("returns the requested number of words using only unlocked characters", () => {
        const characters = ["a", "s", "d", "f"]
        const text = generate(["as", "sad", "fad", "data"], characters, 40)

        expect(text.split(" ")).toHaveLength(40)
        expect([...text].every((char) => char === " " || characters.includes(char))).toBe(true)
    })

    it("guarantees coverage even when an existing real-word pool omits a key", () => {
        // The legacy generator saw `as`/`sad`/`dad`, declared the pool viable,
        // and generated an entire passage without the newly unlocked `f`.
        const characters = ["a", "s", "d", "f"]
        const text = generate(["as", "sad", "dad", "fast", "safe"], characters, 30)

        for (const character of characters) expect(occurrences(text, character)).toBeGreaterThanOrEqual(2)
    })

    it("uses real carrier words before fabricating text", () => {
        const corpus = ["as", "sad", "fad", "data"]
        const text = generate(corpus, ["a", "s", "d", "f"], 20)

        expect(text.split(" ").every((word) => word === "as" || word === "sad" || word === "fad")).toBe(true)
    })

    it("uses a vowel-bearing phonological fallback instead of an arbitrary fragment", () => {
        const text = generate(["paper", "maker", "later"], ["p", "a"], 12)

        expect(text.split(" ").some((word) => word.length > 1 && word.includes("a"))).toBe(true)
        expect(text.split(" ").every((word) => [...word].every((char) => char === "p" || char === "a"))).toBe(true)
    })

    it("handles accented graphemes without stripping or decomposing them", () => {
        const text = generate(
            ["für", "führen", "früh", "über"],
            ["f", "ü", "r"],
            20,
            "german",
        )

        expect(occurrences(text, "ü")).toBeGreaterThanOrEqual(2)
        expect([...text].every((char) => char === " " || ["f", "ü", "r"].includes(char))).toBe(true)
    })

    it("is deterministic when the caller supplies a seeded random source", () => {
        const corpus = ["as", "sad", "fad", "data"]
        const first = generate(corpus, ["a", "s", "d", "f"], 30)
        const second = generate(corpus, ["a", "s", "d", "f"], 30)

        expect(second).toBe(first)
    })

    it("terminates with explicit key tokens when no linguistic path exists", () => {
        const text = generate(["quick", "water"], ["q", "w"], 20)

        expect(text.split(" ")).toHaveLength(20)
        expect(text).not.toContain("undefined")
        expect(occurrences(text, "q")).toBeGreaterThanOrEqual(2)
        expect(occurrences(text, "w")).toBeGreaterThanOrEqual(2)
    })

    it("keeps repeated 500-word generation fast after its one-time corpus index", () => {
        const characters = "abcdefghijklmnopqrstuvwxyz".split("")
        // Warm the memoized corpus model and restricted pool; prompt extension
        // uses the same stable language-array identity in production.
        generate(english10k.words, characters, 500)

        const started = performance.now()
        for (let index = 0; index < 10; index += 1) {
            generate(english10k.words, characters, 500)
        }
        expect(performance.now() - started).toBeLessThan(500)
    })
})
