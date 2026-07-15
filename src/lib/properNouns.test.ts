import { describe, expect, it } from "vitest"
import { capitalizeProperNouns } from "./properNouns"

describe("capitalizeProperNouns", () => {
    it("recovers single- and multi-word country and city casing", () => {
        expect(capitalizeProperNouns(["canada", "australia", "new", "york", "london"], "english"))
            .toEqual(["Canada", "Australia", "New", "York", "London"])
    })

    it("recovers state, territory and initialism casing absent from Intl", () => {
        expect(capitalizeProperNouns([
            "texas", "california", "south", "australia", "fbi", "nasa", "pdf", "usb",
        ], "english")).toEqual([
            "Texas", "California", "South", "Australia", "FBI", "NASA", "PDF", "USB",
        ])
    })

    it("does not uppercase ambiguous lowercase words as initialisms", () => {
        expect(capitalizeProperNouns(["contact", "us", "at", "home"], "english"))
            .toEqual(["contact", "us", "at", "home"])
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
