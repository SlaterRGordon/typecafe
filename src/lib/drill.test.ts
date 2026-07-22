import { describe, expect, test } from "vitest"
import { buildKeyDrillPool, compileDrillText, rankDrillWords } from "./drill"
import { targetAction, type CoachingTarget } from "./coachingTarget"

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

    test("keeps accented words in the pool (non-English lists)", () => {
        // Half the common Polish/French vocabulary carries diacritics - dropping
        // those words would drill an unrepresentative rump of the language.
        const ranked = rankDrillWords(["école", "être", "già", "week-end", "łatwe"], ["e"])
        expect(ranked.map((candidate) => candidate.word)).toEqual(expect.arrayContaining(["école", "être", "łatwe"]))
        expect(ranked).not.toContainEqual(expect.objectContaining({ word: "week-end" }))
    })
})

describe("compileDrillText", () => {
    test("builds a verbatim word drill from the given words, ignoring the word list", () => {
        const text = compileDrillText({
            words: ["Question", "rhythm", "42", "fly"],
            wordList: ["alpha", "beta"],
            length: 6,
            rng: cyclingRng(),
        })
        const words = text.split(" ")

        expect(words).toHaveLength(6)
        // Only the letters-only words survive; "42" is dropped. Case folded.
        expect(new Set(words)).toEqual(new Set(["question", "rhythm", "fly"]))
    })

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

    test("falls back to real words when alphabetic transition matches are scarce", () => {
        const words = compileDrillText({
            transitions: ["yl"],
            wordList: ["style", "only", "yellow", "early", "play"],
            length: 6,
            rng: cyclingRng(),
        }).split(" ")

        expect(words).toHaveLength(6)
        expect(words.every((word) => ["style", "only", "yellow", "early", "play"].includes(word))).toBe(true)
        expect(words).not.toContain("yll")
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

    test("saturates every Target with focused carriers", () => {
        const wordList = ["action", "station", "motion", "nation", "portion", "section", "option", "the", "and", "with", "from", "have", "your", "more", "will", "home", "time", "work", "page", "good"]
        const target: CoachingTarget = { kind: "gram", gram: "tion" }
        const acquisition = compileDrillText({ target, wordList, length: 30, rng: cyclingRng() }).split(" ")

        expect(acquisition.every((word) => word.includes("tion"))).toBe(true)
        expect(acquisition.filter((word) => word.includes("tion"))).toHaveLength(30)
    })

    test("compiles content and an action for every domain Target", () => {
        const wordList = ["quick", "quiet", "question", "action", "station", "motion", "from", "dream", "swing", "aqua", "the", "and", "with", "home"]
        const targets: CoachingTarget[] = [
            { kind: "key", keys: ["q"], metric: "accuracy" },
            { kind: "transition", pair: "ti", metric: "latency" },
            { kind: "gram", gram: "tion" },
            { kind: "word", words: ["quick", "quiet"], sharedGram: "qui" },
            { kind: "movement", movement: "row-reach", anchors: ["fr", "dr", "sw", "aq"] },
            { kind: "correction", expected: "q", typed: "x" },
            { kind: "endurance", shortSeconds: 30, longSeconds: 60 },
        ]

        for (const target of targets) {
            expect(compileDrillText({ target, wordList, length: 20, rng: cyclingRng() }), target.kind).not.toBe("")
            expect(targetAction(target).href, target.kind).not.toBe("")
        }
    })

    test("movement practice includes several concrete anchor sequences", () => {
        const target: CoachingTarget = { kind: "movement", movement: "row-reach", anchors: ["fr", "dr", "sw", "aq"] }
        const text = compileDrillText({
            target,
            wordList: ["from", "dream", "swing", "aqua", "the", "with"],
            length: 12,
            rng: cyclingRng(),
        })

        for (const anchor of target.anchors) expect(text).toContain(anchor)
    })
})
