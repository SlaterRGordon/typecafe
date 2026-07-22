import { describe, expect, it } from "vitest"
import { normalizePracticeGram, normalizePracticeItem, normalizePracticeWord, practiceItemKind } from "./practiceItem"

describe("Grams & words item policy", () => {
    it("keeps Grams at 2–4 Unicode letters", () => {
        expect(normalizePracticeGram(" ÉTÉ ")).toBe("été")
        expect(normalizePracticeGram("a")).toBeNull()
        expect(normalizePracticeGram("hello")).toBeNull()
        expect(normalizePracticeGram("a-b")).toBeNull()
    })

    it("keeps Words whole at 5–32 code points with only internal joins", () => {
        expect(normalizePracticeWord(" L’esprit ")).toBe("l'esprit")
        expect(normalizePracticeWord("Co‑operate")).toBe("co-operate")
        expect(normalizePracticeWord("hello world")).toBeNull()
        expect(normalizePracticeWord("-hello")).toBeNull()
        expect(normalizePracticeWord("hello-")).toBeNull()
        expect(normalizePracticeWord("a".repeat(33))).toBeNull()
    })

    it("classifies the disjoint normalized shapes", () => {
        expect(normalizePracticeItem("tion")).toBe("tion")
        expect(normalizePracticeItem("rhythm")).toBe("rhythm")
        expect(practiceItemKind("tion")).toBe("gram")
        expect(practiceItemKind("rhythm")).toBe("word")
    })
})
