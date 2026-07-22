import { describe, expect, it } from "vitest"
import english10k from "~/components/typer/languages/english10k.json"
import { generatePhonologicalFocusCarrier, generatePhonologicalText, generatePhonologicalWord } from "."

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
        expect(generatePhonologicalFocusCarrier({ language: "chinese", focus: "你" })).toBeNull()
        expect(generatePhonologicalFocusCarrier({ language: "hindi", focus: "न" })).toBeNull()
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

describe("generatePhonologicalText", () => {
    const request = {
        language: "english",
        corpus: english10k.words,
        allowedCharacters: "asdfghjkl".split(""),
        count: 40,
    }

    it("mixes natural carriers with novel spellings in an exact-length passage", () => {
        const words = generatePhonologicalText({ ...request, rng: cyclingRng() }).split(" ")
        const corpus = new Set(english10k.words.map((word) => word.toLowerCase().normalize("NFC")))

        expect(words).toHaveLength(request.count)
        expect(words.some((word) => corpus.has(word))).toBe(true)
        expect(words.some((word) => !corpus.has(word))).toBe(true)
        expect(words.every((word) => [...word].every((character) => request.allowedCharacters.includes(character)))).toBe(true)
        expect(words.every((word) => word.length >= 3 && word.length <= 10)).toBe(true)
    })

    it("covers every active key repeatedly and avoids mechanical repetition", () => {
        const words = generatePhonologicalText({ ...request, rng: cyclingRng() }).split(" ")
        const text = words.join("")

        for (const character of request.allowedCharacters) {
            expect([...text].filter((candidate) => candidate === character).length).toBeGreaterThanOrEqual(2)
        }
        expect(new Set(words).size).toBeGreaterThan(10)
        words.forEach((word, index) => {
            if (index > 0) expect(word).not.toBe(words[index - 1])
        })
    })

    it("keeps sparse-alphabet output word-shaped with corpus-attested transitions", () => {
        // The exact active letters from the weak sample that motivated the
        // whole-word model. The syllable-only engine emitted x/y/u fragments,
        // repeated vowel collisions, and mostly two-character tokens here.
        const allowedCharacters = "auyvixjb".split("")
        const words = generatePhonologicalText({
            language: "english",
            corpus: english10k.words,
            allowedCharacters,
            count: 80,
            rng: cyclingRng(),
        }).split(" ")
        const corpusBigrams = new Set(english10k.words.flatMap((word) => {
            const characters = [...word.toLowerCase().normalize("NFC")]
            return characters.slice(1).map((character, index) => `${characters[index]}${character}`)
        }))
        const corpus = new Set(english10k.words)
        const generated = words.filter((word) => !corpus.has(word))

        expect(words.filter((word) => word.length < 3 || word.length > 10)).toEqual([])
        expect(generated.filter((word) => word.length > 7)).toEqual([])
        expect(generated.filter((word) => /[aeiouy]{4}/.test(word))).toEqual([])
        expect(generated.filter((word) => /(.)\1\1/.test(word))).toEqual([])
        expect(words.filter((word) => [...word].some((character) => !allowedCharacters.includes(character)))).toEqual([])
        expect(words.filter((word) => [...word].slice(1).some((character, index) => !corpusBigrams.has(`${[...word][index]}${character}`)))).toEqual([])
        words.forEach((word, index) => {
            if (index > 0) expect(word).not.toBe(words[index - 1])
        })
        for (const character of allowedCharacters) {
            expect([...words.join("")].filter((candidate) => candidate === character).length).toBeGreaterThanOrEqual(2)
        }
    })

    it("rejects long stitched outliers in the reported sparse alphabet", () => {
        const allowedCharacters = "auvixjbz".split("")
        const corpus = new Set(english10k.words)
        const words = generatePhonologicalText({
            language: "english",
            corpus: english10k.words,
            allowedCharacters,
            count: 200,
            rng: cyclingRng(),
        }).split(" ")
        const generated = words.filter((word) => !corpus.has(word))

        expect(words).not.toContain("uauabuibia")
        expect(generated.filter((word) => word.length > 7)).toEqual([])
        expect(generated.filter((word) => /[aeiouy]{4}/.test(word))).toEqual([])
        expect(generated.filter((word) => /(.)\1\1/.test(word))).toEqual([])
        for (const character of allowedCharacters) {
            expect(words.join("")).toContain(character)
        }
    })

    it("is deterministic with an injected random source", () => {
        const first = generatePhonologicalText({ ...request, rng: cyclingRng() })
        const second = generatePhonologicalText({ ...request, rng: cyclingRng() })

        expect(second).toBe(first)
    })

    it("terminates with explicit key fallbacks when no vowel-bearing form is possible", () => {
        const text = generatePhonologicalText({
            language: "english",
            corpus: english10k.words,
            allowedCharacters: ["s", "t", "r"],
            count: 6,
            rng: cyclingRng(),
        })

        expect(text.split(" ")).toHaveLength(6)
        expect([...text.replaceAll(" ", "")].every((character) => "str".includes(character))).toBe(true)
    })

    it("generates a full cached practice buffer within the interaction budget", () => {
        generatePhonologicalText({ ...request, count: 1, rng: cyclingRng() })
        const started = performance.now()
        const text = generatePhonologicalText({ ...request, count: 500, rng: cyclingRng() })

        expect(text.split(" ")).toHaveLength(500)
        expect(performance.now() - started).toBeLessThan(500)
    })
})
