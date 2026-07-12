import { describe, expect, it } from "vitest"
import english10k from "~/components/typer/languages/english10k.json"
import { generatePhonologicalWord } from "."

const cyclingRng = () => {
    let value = 0
    return () => {
        value = (value + 0.381966) % 1
        return value
    }
}

const fixtures = [
    { language: "english", corpus: ["paper", "maker", "later"], allowed: "pa", required: "p" },
    { language: "french", corpus: ["manger", "danger", "ranger", "gel", "ami"], allowed: "man", required: "n" },
    { language: "spanish", corpus: ["casa", "masa", "paso", "sol", "día"], allowed: "ca", required: "c" },
    { language: "german", corpus: ["machen", "lachen", "chemie", "aber", "so"], allowed: "ma", required: "m" },
    { language: "italian", corpus: ["casa", "mare", "solo"], allowed: "ca", required: "c" },
    { language: "portuguese", corpus: ["casa", "mala", "sapo", "amigo"], allowed: "ca", required: "c" },
    { language: "dutch", corpus: ["maken", "laken", "kaas", "auto"], allowed: "ma", required: "m" },
    { language: "polish", corpus: ["mama", "mapa", "auto"], allowed: "ma", required: "m" },
] as const

describe("generatePhonologicalWord", () => {
    it.each(fixtures)("generates a novel licensed syllable in $language", ({ language, corpus, allowed, required }) => {
        const word = generatePhonologicalWord({
            language,
            corpus,
            allowedCharacters: [...allowed],
            requiredCharacter: required,
            rng: cyclingRng(),
        })

        expect(word).not.toBeNull()
        expect(corpus).not.toContain(word)
        expect(word).toContain(required)
        expect([...word!].every((char) => allowed.includes(char))).toBe(true)
        expect(word!.length).toBeGreaterThan(1)
    })

    it("rejects consonant-only output even when those letters occur in the corpus", () => {
        const word = generatePhonologicalWord({
            language: "english",
            corpus: ["strengths", "strands", "rests"],
            allowedCharacters: ["s", "t", "r"],
            requiredCharacter: "s",
            rng: cyclingRng(),
        })

        expect(word).toBeNull()
    })

    it("rejects an internal fragment whose coda cannot legally end a word", () => {
        const word = generatePhonologicalWord({
            language: "english",
            corpus: ["atlas", "atom", "aside"],
            allowedCharacters: ["a", "t", "l"],
            requiredCharacter: "t",
            rng: cyclingRng(),
        })

        expect(word).toBeNull()
    })

    it("returns null for unsupported scripts instead of silently applying another language", () => {
        expect(generatePhonologicalWord({
            language: "chinese",
            corpus: ["你好"],
            allowedCharacters: ["你"],
            requiredCharacter: "你",
        })).toBeNull()
    })

    it("is deterministic with an injected random source", () => {
        const request = { language: "english", corpus: ["paper", "maker", "later"], allowedCharacters: ["p", "a"], requiredCharacter: "p" }
        const first = generatePhonologicalWord({ ...request, rng: cyclingRng() })
        const second = generatePhonologicalWord({ ...request, rng: cyclingRng() })

        expect(second).toBe(first)
    })

    it("memoizes the corpus model and per-alphabet syllable pool", () => {
        const request = {
            language: "english",
            corpus: english10k.words,
            allowedCharacters: "abcdefghijklmnopqrstuvwxyz".split(""),
            requiredCharacter: "z",
        }
        generatePhonologicalWord({ ...request, rng: cyclingRng() })

        const started = performance.now()
        for (let index = 0; index < 100; index += 1) {
            generatePhonologicalWord({ ...request, rng: cyclingRng() })
        }
        expect(performance.now() - started).toBeLessThan(500)
    })

    it("builds a fresh 10k-word language model without blocking prompt generation", () => {
        const corpus = [...english10k.words]
        const started = performance.now()
        const word = generatePhonologicalWord({
            language: "english",
            corpus,
            allowedCharacters: "asdfghjkl".split(""),
            requiredCharacter: "j",
            rng: cyclingRng(),
        })

        expect(word).not.toBeNull()
        expect(performance.now() - started).toBeLessThan(500)
    })
})
