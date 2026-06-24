import { describe, expect, it, beforeAll } from "vitest";
import quotes from "./languages/quotes.json";
import { ensureQuotesLoaded, generateQuote } from "./utils";

// Quotes are typed verbatim, so the only logic worth pinning is bucket
// selection: each length draws from its own pool, "all" pools everything, and a
// stale/invalid persisted value falls back to "all" instead of crashing.
describe("generateQuote", () => {
    beforeAll(() => ensureQuotesLoaded());

    const all = new Set([...quotes.short, ...quotes.medium, ...quotes.long]);

    it("draws a real quote from the requested bucket", () => {
        for (const bucket of ["short", "medium", "long"] as const) {
            const pool = new Set(quotes[bucket]);
            // Sample a few times since selection is random.
            for (let i = 0; i < 20; i++) expect(pool.has(generateQuote(bucket))).toBe(true);
        }
    });

    it("pools every bucket for 'all'", () => {
        for (let i = 0; i < 20; i++) expect(all.has(generateQuote("all"))).toBe(true);
    });

    it("falls back to the full pool for a stale value", () => {
        // @ts-expect-error — simulating a corrupt localStorage QuoteLength
        expect(all.has(generateQuote("bogus"))).toBe(true);
    });
});
