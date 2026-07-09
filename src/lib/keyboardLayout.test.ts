import { describe, expect, it } from "vitest"
import {
    DEFAULT_LAYOUT,
    LAYOUT_IDS,
    LAYOUTS,
    boardFor,
    glyphAt,
    keyFor,
    keyStagesFor,
    rowsFor,
    sequenceFor,
    statsPoolFor,
} from "./keyboardLayout"
import { HEATMAP_ROWS } from "./heatmap"
import { levels } from "~/components/typer/train/levels"

const VOWELS = "aeiou"
const sorted = (s: string) => s.split("").sort().join("")
const DE = "qwertz-de"

describe("layout catalogs", () => {
    it("the geometry knows every picker layout plus qwertz-de", () => {
        for (const layout of LAYOUTS) expect(LAYOUT_IDS).toContain(layout)
        expect(LAYOUT_IDS).toContain(DE)
        // qwertz-de stays out of the picker until slice 4 renders ISO boards.
        expect(LAYOUTS).not.toContain(DE)
    })
})

describe("rowsFor", () => {
    it("qwerty is the heatmap's board", () => {
        expect(rowsFor("qwerty")).toEqual([...HEATMAP_ROWS])
    })

    it("unknown layouts fall back to qwerty", () => {
        expect(rowsFor("corrupt-storage-value")).toEqual(rowsFor(DEFAULT_LAYOUT))
    })

    it("every layout has 26 distinct letters", () => {
        for (const layout of LAYOUT_IDS) {
            const letters = rowsFor(layout).join("").split("").filter((ch) => /[a-z]/.test(ch))
            expect(new Set(letters).size).toBe(26)
            expect(letters).toHaveLength(26)
        }
    })
})

describe("boardFor", () => {
    it("qwerty is an ANSI board, qwertz-de an ISO board", () => {
        expect(boardFor("qwerty").shape).toBe("ansi")
        expect(boardFor(DE).shape).toBe("iso")
    })

    it("qwertz-de carries the ISO extra key at the start of the bottom row", () => {
        const bottom = boardFor(DE).rows[3]!
        expect(bottom[0]!.base).toBe("<")
        // The extra key shifts letters one column right of their ANSI spots.
        expect(bottom).toHaveLength(boardFor("qwerty").rows[3]!.length + 1)
    })

    it("qwertz-de's D-row is the German T1 letter row", () => {
        const dRow = boardFor(DE).rows[1]!.map((cap) => cap.base).join("")
        expect(dRow).toBe("qwertzuiopü+")
    })
})

describe("keyFor", () => {
    it("maps direct glyphs to their key", () => {
        expect(keyFor("ü", DE)).toBe("ü")
        expect(keyFor("ß", DE)).toBe("ß")
        expect(keyFor(" ", DE)).toBe(" ")
    })

    it("folds shift-layer glyphs onto their key", () => {
        expect(keyFor("/", DE)).toBe("7")
        expect(keyFor("°", DE)).toBe("^")
    })

    it("folds AltGr glyphs onto their key", () => {
        expect(keyFor("@", DE)).toBe("q")
        expect(keyFor("€", DE)).toBe("e")
        expect(keyFor("µ", DE)).toBe("m")
    })

    it("folds uppercase onto the letter's key", () => {
        expect(keyFor("Ü", DE)).toBe("ü")
    })

    it("returns null for dead-composed and off-board chars", () => {
        expect(keyFor("ê", DE)).toBeNull()
        expect(keyFor("ą", DE)).toBeNull()
        // ü exists on qwertz-de only — qwerty still rejects it.
        expect(keyFor("ü", "qwerty")).toBeNull()
    })
})

describe("glyphAt", () => {
    it("reads authored layers", () => {
        expect(glyphAt("q", "shift", DE)).toBe("Q")
        expect(glyphAt("q", "altgr", DE)).toBe("@")
        expect(glyphAt("+", "altgr", DE)).toBe("~")
        expect(glyphAt("2", "altgr", DE)).toBe("²")
    })

    it("ß shifts to the authored ?, not the uppercase ẞ", () => {
        expect(glyphAt("ß", "shift", DE)).toBe("?")
    })

    it("off-board keys echo themselves on base/shift and go blank on AltGr layers", () => {
        expect(glyphAt(" ", "base", DE)).toBe(" ")
        expect(glyphAt(" ", "shift", DE)).toBe(" ")
        expect(glyphAt(" ", "altgr", DE)).toBe("")
    })
})

describe("sequenceFor", () => {
    it("direct keys are one plain step", () => {
        expect(sequenceFor("ü", DE)).toEqual([{ key: "ü" }])
    })

    it("uppercase without its own cap is the lowercase step with shift", () => {
        expect(sequenceFor("Ü", DE)).toEqual([{ key: "ü", shift: true }])
    })

    it("AltGr glyphs carry the altgr modifier", () => {
        expect(sequenceFor("@", DE)).toEqual([{ key: "q", altgr: true }])
    })

    it("dead-key chars take two steps: dead press, then base", () => {
        expect(sequenceFor("é", DE)).toEqual([{ key: "´", dead: true }, { key: "e" }])
        expect(sequenceFor("ê", DE)).toEqual([{ key: "^", dead: true }, { key: "e" }])
    })

    it("a dead glyph on the shift layer keeps shift on the dead press", () => {
        // ` is the shift layer of the ´ cap, and dead.
        expect(sequenceFor("è", DE)).toEqual([{ key: "´", shift: true, dead: true }, { key: "e" }])
    })

    it("uppercase composed chars put shift on the final press", () => {
        expect(sequenceFor("Ê", DE)).toEqual([{ key: "^", dead: true }, { key: "e", shift: true }])
    })

    it("unreachable chars return []", () => {
        expect(sequenceFor("ą", DE)).toEqual([])
    })
})

describe("reachability", () => {
    it("every layout types all 26 letters in at most two steps", () => {
        for (const layout of LAYOUT_IDS) {
            for (const ch of "abcdefghijklmnopqrstuvwxyz") {
                const steps = sequenceFor(ch, layout)
                expect(steps.length, `"${ch}" on ${layout}`).toBeGreaterThan(0)
                expect(steps.length, `"${ch}" on ${layout}`).toBeLessThanOrEqual(2)
            }
        }
    })

    it("qwertz-de reaches German's accent set", () => {
        for (const ch of "äöüß") {
            expect(sequenceFor(ch, DE).length, `"${ch}"`).toBeGreaterThan(0)
        }
    })
})

describe("dead flags", () => {
    const capOf = (base: string) =>
        boardFor(DE).rows.flat().find((cap) => cap.base === base)!

    it("^ is dead on base but its shift layer ° is not", () => {
        const cap = capOf("^")
        expect(cap.dead).toContain("base")
        expect(cap.dead).not.toContain("shift")
    })

    it("´ is dead on base and on shift (backtick)", () => {
        const cap = capOf("´")
        expect(cap.dead).toContain("base")
        expect(cap.dead).toContain("shift")
    })
})

describe("statsPoolFor", () => {
    it("remap layouts key their own pool", () => {
        for (const layout of ["dvorak", "colemak", "colemak-dh", "workman"]) {
            expect(statsPoolFor(layout)).toBe(layout)
        }
    })

    it("qwerty, national layouts and unknowns share the qwerty pool", () => {
        expect(statsPoolFor("qwerty")).toBe("qwerty")
        expect(statsPoolFor(DE)).toBe("qwerty")
        expect(statsPoolFor("corrupt-storage-value")).toBe("qwerty")
    })
})

describe("keyStagesFor", () => {
    it("qwerty reproduces the hand-authored ladder stages (as key sets)", () => {
        // The stages the live ladder actually uses, in introduction order.
        const ladderStages = [...new Set(levels.map((level) => level.keys))]
        const derived = keyStagesFor("qwerty")
        expect(derived).toHaveLength(ladderStages.length)
        derived.forEach((stage, i) => expect(sorted(stage)).toBe(sorted(ladderStages[i]!)))
    })

    it("every layout climbs home-row-out to all 26 letters", () => {
        for (const layout of LAYOUT_IDS) {
            const stages = keyStagesFor(layout)
            const homeLetters = new Set(rowsFor(layout)[2]!.split("").filter((ch) => /[a-z]/.test(ch)))

            expect(stages).toHaveLength(11)
            const first = stages[0]!
            // Stage 1 is the resting fingers: home-row letters only, and enough
            // of them to generate words (Practice's floor: 6+ keys, a vowel and
            // a consonant).
            expect(first.split("").every((ch) => homeLetters.has(ch))).toBe(true)
            expect(first.length).toBeGreaterThanOrEqual(6)
            expect(first.split("").some((ch) => VOWELS.includes(ch))).toBe(true)
            expect(first.split("").some((ch) => !VOWELS.includes(ch))).toBe(true)

            // Stages are cumulative and never repeat a key.
            for (let i = 1; i < stages.length; i++) {
                expect(stages[i]!.startsWith(stages[i - 1]!)).toBe(true)
            }
            const finalKeys = stages[stages.length - 1]!
            expect(new Set(finalKeys).size).toBe(finalKeys.length)

            // The full alphabet arrives by the final stage — exactly 26, so
            // withLanguageAccents (keys.length < 26 guard) still fires on it.
            expect(sorted(finalKeys)).toBe("abcdefghijklmnopqrstuvwxyz")
        }
    })
})
