import { describe, expect, it } from "vitest";
import { baseTypeLanguage } from "./typeLanguage";

// English vocabulary sizes share one competitive TestType ("english"), so a
// signed-in user's score persists and lands on the same leaderboard regardless
// of which size they practiced. Other languages pass through untouched.
describe("baseTypeLanguage", () => {
    it("collapses every English vocabulary size to english", () => {
        for (const size of ["english", "english1k", "english5k", "english10k", "english25k", "english50k"]) {
            expect(baseTypeLanguage(size)).toBe("english");
        }
    });

    it("leaves other languages unchanged", () => {
        expect(baseTypeLanguage("french")).toBe("french");
        expect(baseTypeLanguage("spanish")).toBe("spanish");
    });

    it("passes undefined through", () => {
        expect(baseTypeLanguage(undefined)).toBeUndefined();
    });
});
