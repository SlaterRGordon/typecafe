import { describe, expect, it } from "vitest";
import { profileProofSummary, type ProfileProofRecord } from "./profileProof";

const NOW = new Date("2026-06-30T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function rec(daysAgo: number, speed: number, accuracy = 100, consistency?: number): ProfileProofRecord {
    return {
        speed,
        accuracy,
        consistency,
        createdAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
    };
}

describe("profileProofSummary", () => {
    it("returns empty proof when the profile has no usable ranked tests", () => {
        expect(profileProofSummary([], NOW)).toEqual({
            bestWpm: null,
            baselineWpm: null,
            baselineAccuracy: null,
            baselineConsistency: null,
            baselineCount: 0,
            recentWpm: null,
            recentAccuracy: null,
            recentConsistency: null,
            thirtyDayDelta: null,
            recentCount: 0,
        });
    });

    it("summarizes best, recent WPM, accuracy, and consistency from recent tests", () => {
        const summary = profileProofSummary([
            rec(12, 70, 95, 80),
            rec(8, 80, 100, 90),
            rec(4, 90, 100),
        ], NOW);

        expect(summary.bestWpm).toBe(90);
        expect(summary.recentWpm).toBeCloseTo((63 + 80 + 90) / 3, 6);
        expect(summary.recentAccuracy).toBeCloseTo(98.333, 3);
        expect(summary.recentConsistency).toBe(85);
        expect(summary.recentCount).toBe(3);
        expect(summary.baselineWpm).toBeCloseTo(63, 6);
        expect(summary.baselineAccuracy).toBe(95);
        expect(summary.baselineConsistency).toBe(80);
        expect(summary.baselineCount).toBe(1);
    });

    it("compares recent tests to the previous recent sample when history is deeper", () => {
        const records = Array.from({ length: 24 }, (_, index) => rec(60 - index, 50 + index, 90 + index * 0.25, 70 + index * 0.5));
        const summary = profileProofSummary(records, NOW);

        expect(summary.baselineCount).toBe(10);
        expect(summary.recentCount).toBe(10);
        expect(summary.recentWpm).toBeGreaterThan(summary.baselineWpm ?? 0);
        expect(summary.recentAccuracy).toBeGreaterThan(summary.baselineAccuracy ?? 0);
        expect(summary.recentConsistency).toBeGreaterThan(summary.baselineConsistency ?? 0);
    });

    it("reports a 30-day delta when both windows have tests", () => {
        const summary = profileProofSummary([
            rec(55, 50),
            rec(45, 55),
            rec(35, 60),
            rec(25, 70),
            rec(15, 75),
            rec(5, 80),
        ], NOW);

        expect(summary.thirtyDayDelta).toBe(20);
    });

    it("reports a 30-day delta even when the baseline window is thin", () => {
        const summary = profileProofSummary([
            rec(45, 55),
            rec(25, 70),
            rec(15, 75),
            rec(5, 80),
        ], NOW);

        expect(summary.thirtyDayDelta).toBe(20);
    });

    it("falls back to sparse recent progress when all tests are from the last few days", () => {
        const summary = profileProofSummary([
            rec(4, 70),
            rec(2, 76),
            rec(1, 82),
        ], NOW);

        expect(summary.thirtyDayDelta).toBe(9);
    });

    it("keeps a delta chip value available for a single ranked test", () => {
        const summary = profileProofSummary([rec(1, 70)], NOW);

        expect(summary.thirtyDayDelta).toBe(0);
    });
});
