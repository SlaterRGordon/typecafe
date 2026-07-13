import { describe, expect, it } from "vitest"
import { capitalizeProperNouns } from "./properNouns"

describe("capitalizeProperNouns", () => {
    it("recovers single- and multi-word country and city casing", () => {
        expect(capitalizeProperNouns(["canada", "new", "york", "london"], "english"))
            .toEqual(["Canada", "New", "York", "London"])
    })

    it("does not capitalize an unmatched component of a place name", () => {
        expect(capitalizeProperNouns(["a", "new", "idea"], "english"))
            .toEqual(["a", "new", "idea"])
    })

    it("uses the selected language's canonical casing", () => {
        expect(capitalizeProperNouns(["españa", "lunes"], "spanish"))
            .toEqual(["España", "lunes"])
        expect(capitalizeProperNouns(["france", "lundi"], "french"))
            .toEqual(["France", "lundi"])
    })
})
