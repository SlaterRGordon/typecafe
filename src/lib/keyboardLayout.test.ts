import { describe, expect, it } from "vitest"
import {
    DEFAULT_LAYOUT,
    LAYOUT_IDS,
    LAYOUTS,
    boardFor,
    composedFor,
    glyphAt,
    keyFor,
    keyStagesFor,
    languageForLayout,
    rowsFor,
    sequenceFor,
    statsPoolFor,
} from "./keyboardLayout"
import { classifyMovement } from "./movementClassification"
import { HEATMAP_ROWS } from "./heatmap"
import { levels } from "~/components/typer/train/levels"

const VOWELS = "aeiou"
const sorted = (s: string) => s.split("").sort().join("")
const DE = "qwertz-de"

describe("layout catalogs", () => {
    it("every picker layout is known to the geometry", () => {
        for (const layout of LAYOUTS) expect(LAYOUT_IDS).toContain(layout)
        // qwertz-de joined the picker with the layered boards (slices 4-5).
        expect(LAYOUTS).toContain(DE)
    })

    it("maps detected national layouts back to the app language when unambiguous", () => {
        expect(languageForLayout("qwertz-de")).toBe("german")
        expect(languageForLayout("azerty-fr")).toBe("french")
        expect(languageForLayout("qwerty-latam")).toBe("spanish")
        expect(languageForLayout("qwerty-abnt2")).toBe("portuguese")
        expect(languageForLayout("qwerty-pl")).toBe("polish")
        expect(languageForLayout("colemak")).toBeNull()
        expect(languageForLayout("qwerty")).toBeNull()
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

    it("folds dead-composed chars onto the dead key's cell", () => {
        // ê has no cell of its own on qwertz-de - it rides ^ (dead circumflex).
        expect(keyFor("ê", DE)).toBe("^")
        // Uppercase composed folds the same way.
        expect(keyFor("Ê", DE)).toBe("^")
        // A direct glyph never folds through compose: ü is its own key.
        expect(keyFor("ü", DE)).toBe("ü")
    })

    it("returns null for untypeable and off-board chars", () => {
        // No ogonek compose row: ą is untypeable on qwertz-de.
        expect(keyFor("ą", DE)).toBeNull()
        // ü exists on qwertz-de only - qwerty still rejects it.
        expect(keyFor("ü", "qwerty")).toBeNull()
        // qwerty has no dead keys, so composed chars stay unmapped there.
        expect(keyFor("ê", "qwerty")).toBeNull()
    })
})

describe("composedFor", () => {
    it("lists exactly the chars a dead glyph composes on the layout", () => {
        // The ^ COMPOSE row (a e i o u) - none direct on qwertz-de, all listed.
        expect([...composedFor("^", DE)].sort()).toEqual(["â", "ê", "î", "ô", "û"])
        // ´ composes ý too: y has its own key on qwertz-de.
        expect([...composedFor("´", DE)].sort()).toEqual(["á", "é", "í", "ó", "ú", "ý"])
    })

    it("returns [] for non-dead glyphs, dead-free layouts, and unknown layouts", () => {
        expect(composedFor("a", DE)).toEqual([])
        // qwerty has no dead keys; unknown layouts fall back to it.
        expect(composedFor("^", "qwerty")).toEqual([])
        expect(composedFor("^", "no-such-layout")).toEqual([])
    })

    it("never lists a char that has its own cell", () => {
        // The umlauts are direct keys on qwertz-de - no dead glyph may claim
        // them, and ¨ (their composer elsewhere) isn't dead here at all.
        for (const dead of ["^", "´", "`", "¨"]) {
            for (const direct of ["ü", "ö", "ä"]) {
                expect(composedFor(dead, DE)).not.toContain(direct)
            }
        }
        // Every listed char is dead-only: two keystrokes, never a direct cap.
        for (const dead of ["^", "´", "`"]) {
            for (const composed of composedFor(dead, DE)) {
                expect(sequenceFor(composed, DE)).toHaveLength(2)
            }
        }
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

    it("every language's default layout reaches its accent set", () => {
        // The honest per-layout sets: what each national layout can actually
        // produce (œ is deliberately absent - real AZERTY can't type it).
        const accentSets: Record<string, string> = {
            "azerty-fr": "éèàùçâêîôûëïü",
            "qwerty-es": "ñáéíóúü",
            "qwerty-latam": "ñáéíóúü",
            "qwerty-it": "àèéìòù",
            "qwerty-pt": "ãõçáéíóúâêôà",
            "qwerty-abnt2": "ãõçáéíóúâêôà",
            "qwerty-pl": "ąćęłńóśźż",
            "qwerty-us-intl": "éëïöüáíóúñàè",
        }
        for (const [layout, accents] of Object.entries(accentSets)) {
            for (const ch of accents) {
                const steps = sequenceFor(ch, layout)
                expect(steps.length, `"${ch}" on ${layout}`).toBeGreaterThan(0)
                expect(steps.length, `"${ch}" on ${layout}`).toBeLessThanOrEqual(2)
            }
        }
    })

    it("pins wave-2 ground truths", () => {
        // AZERTY: é is a direct key whose shift layer is the digit 2.
        expect(keyFor("é", "azerty-fr")).toBe("é")
        expect(sequenceFor("2", "azerty-fr")).toEqual([{ key: "é", shift: true }])
        // Polish: every accent is an AltGr chord.
        expect(sequenceFor("ą", "qwerty-pl")).toEqual([{ key: "a", altgr: true }])
        // UK: £ lives on shift+3.
        expect(glyphAt("3", "shift", "qwerty-uk")).toBe("£")
        // US-International: é composes through the dead apostrophe.
        expect(sequenceFor("é", "qwerty-us-intl")).toEqual([{ key: "'", dead: true }, { key: "e" }])
        // Italian: é is shift on the è cap - no dead keys at all.
        expect(sequenceFor("é", "qwerty-it")).toEqual([{ key: "è", shift: true }])
        // Portuguese: ã composes through the dead tilde.
        expect(sequenceFor("ã", "qwerty-pt")).toEqual([{ key: "~", dead: true }, { key: "a" }])
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

describe("classifyMovement", () => {
    it("classifies the conventional geometry without claiming observed fingers", () => {
        expect(classifyMovement("f", "r", "qwerty")).toMatchObject({
            sameFinger: true,
            reach: true,
            kind: "same-finger",
            from: { hand: "left", assignedFinger: "index" },
            to: { hand: "left", assignedFinger: "index" },
        })
        expect(classifyMovement("a", "s", "qwerty")).toMatchObject({ roll: "inward", kind: "inward-roll" })
        expect(classifyMovement("s", "a", "qwerty")).toMatchObject({ roll: "outward", kind: "outward-roll" })
        expect(classifyMovement("d", "r", "qwerty")).toMatchObject({ reach: true, kind: "row-reach" })
    })

    it("classifies the same characters through each layout's own geometry", () => {
        expect(classifyMovement("f", "r", "qwerty")?.kind).toBe("same-finger")
        expect(classifyMovement("f", "r", "colemak")?.kind).toBe("row-reach")
    })

    it("returns null when either character is not on the board", () => {
        expect(classifyMovement("a", " ", "qwerty")).toBeNull()
        expect(classifyMovement("a", "ð•’", "qwerty")).toBeNull()
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
            // Stage 1 is the resting fingers: home-row letters, plus at most one
            // borrowed vowel when the home row has none (AZERTY) - word
            // generation needs a vowel from the first stage. Enough keys to
            // generate words (Practice's floor: 6+ keys, vowel + consonant).
            const offRow = first.split("").filter((ch) => !homeLetters.has(ch))
            expect(offRow.length).toBeLessThanOrEqual(1)
            for (const ch of offRow) expect(VOWELS.includes(ch)).toBe(true)
            expect(first.length).toBeGreaterThanOrEqual(6)
            expect(first.split("").some((ch) => VOWELS.includes(ch))).toBe(true)
            expect(first.split("").some((ch) => !VOWELS.includes(ch))).toBe(true)

            // Stages are cumulative and never repeat a key.
            for (let i = 1; i < stages.length; i++) {
                expect(stages[i]!.startsWith(stages[i - 1]!)).toBe(true)
            }
            const finalKeys = stages[stages.length - 1]!
            expect(new Set(finalKeys).size).toBe(finalKeys.length)

            // The full alphabet arrives by the final stage - exactly 26, so
            // withLanguageAccents (keys.length < 26 guard) still fires on it.
            expect(sorted(finalKeys)).toBe("abcdefghijklmnopqrstuvwxyz")
        }
    })
})
