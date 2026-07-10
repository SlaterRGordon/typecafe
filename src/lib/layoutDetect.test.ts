import { describe, expect, it } from "vitest"
import { matchLayout } from "./layoutDetect"

// The pure seam both adapters feed. Adapters themselves are browser glue —
// covered by e2e, not unit-tested here.
describe("matchLayout", () => {
    it("fingerprints QWERTZ from the y/z swap plus an umlaut", () => {
        // Backslash (#) separates German from Swiss hardware.
        expect(matchLayout({ KeyY: "z", Semicolon: "ö", Backslash: "#" })).toBe("qwertz-de")
    })

    it("fingerprints AZERTY from the letter moves", () => {
        expect(matchLayout({ KeyQ: "a", KeyW: "z", Semicolon: "m" })).toBe("azerty-fr")
    })

    it("fingerprints OS-level Dvorak", () => {
        expect(matchLayout({ KeyQ: "'", KeyW: ",", KeyY: "f" })).toBe("dvorak")
    })

    it("separates Colemak from Colemak-DH by the m position", () => {
        expect(matchLayout({ KeyY: "j", Semicolon: "o", KeyM: "m", KeyW: "w" })).toBe("colemak")
        expect(matchLayout({ KeyY: "j", Semicolon: "o", KeyM: "h", KeyW: "w" })).toBe("colemak-dh")
    })

    it("returns null on a single observation, however distinctive", () => {
        expect(matchLayout({ Semicolon: "ö" })).toBeNull()
    })

    it("returns null when observations contradict every candidate", () => {
        expect(matchLayout({ KeyQ: "a", KeyY: "z", Semicolon: "ö" })).toBeNull()
    })

    it("returns null on ambiguity instead of guessing", () => {
        // ñ alone fits both Spanish layouts — the language default decides.
        expect(matchLayout({ Semicolon: "ñ", KeyQ: "q" })).toBeNull()
        // A plain US fingerprint fits qwerty, us-intl and polish alike (they
        // differ only in dead keys/AltGr, invisible to code→key maps).
        expect(matchLayout({ KeyQ: "q", KeyY: "y", Semicolon: ";", Quote: "'", Backslash: "\\" })).toBeNull()
    })

    it("returns null with no observations", () => {
        expect(matchLayout({})).toBeNull()
    })

    it("resolves German vs Swiss QWERTZ only with the separating probe", () => {
        // Umlauts alone tie the two QWERTZ variants.
        expect(matchLayout({ KeyY: "z", Semicolon: "ö", Quote: "ä" })).toBeNull()
        expect(matchLayout({ KeyY: "z", Semicolon: "ö", Minus: "ß" })).toBe("qwertz-de")
    })
})
