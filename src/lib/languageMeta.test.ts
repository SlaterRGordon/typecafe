import { describe, expect, it } from "vitest"
import { PICKER_LANGUAGES, supportsCustomPractice } from "./languageMeta"

describe("supportsCustomPractice", () => {
    it("offers exactly the eight profiled languages", () => {
        expect(PICKER_LANGUAGES.map(({ value }) => value)).toEqual([
            "english", "french", "spanish", "german",
            "italian", "portuguese", "dutch", "polish",
        ])
        expect(PICKER_LANGUAGES.every(({ value }) => supportsCustomPractice(value))).toBe(true)
    })

    it.each(["chinese", "hindi", "unknown"])("does not claim Custom Practice support for %s", (language) => {
        expect(supportsCustomPractice(language)).toBe(false)
    })
})
