import { describe, expect, it } from "vitest"
import { readableTextColor } from "./convertColor"

describe("readableTextColor", () => {
    it("returns black text on the bright aqua primary background", () => {
        expect(readableTextColor("#09ecf3")).toBe("#000000")
    })

    it("returns black text on the aqua secondary background", () => {
        expect(readableTextColor("#966fb3")).toBe("#000000")
    })

    it("returns black text on pure white", () => {
        expect(readableTextColor("#ffffff")).toBe("#000000")
    })

    it("returns white text on pure black", () => {
        expect(readableTextColor("#000000")).toBe("#ffffff")
    })

    it("returns white text on the dark theme base background", () => {
        expect(readableTextColor("#282a36")).toBe("#ffffff")
    })

    it("treats a leading # as optional", () => {
        expect(readableTextColor("09ecf3")).toBe(readableTextColor("#09ecf3"))
    })
})
