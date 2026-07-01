import { describe, expect, it } from "vitest";
import { typingStyleSummary } from "./profileStyle";
import type { ProfileProofSummary } from "./profileProof";

function proof(overrides: Partial<ProfileProofSummary>): ProfileProofSummary {
    return {
        bestWpm: 90,
        baselineWpm: 65,
        baselineAccuracy: 94,
        baselineConsistency: 72,
        baselineCount: 5,
        recentWpm: 70,
        recentAccuracy: 96,
        recentConsistency: 80,
        thirtyDayDelta: 0,
        recentCount: 10,
        ...overrides,
    };
}

describe("typingStyleSummary", () => {
    it("stays encouraging when there is no ranked data yet", () => {
        const summary = typingStyleSummary(proof({
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
        }));

        expect(summary.title).toBe("Style forming");
        expect(summary.metrics).toHaveLength(4);
        expect(summary.metrics.every((metric) => metric.value >= 20)).toBe(true);
    });

    it("frames low accuracy as tuning, not failure", () => {
        const summary = typingStyleSummary(proof({ recentAccuracy: 91 }));

        expect(summary.title).toBe("Quick hands");
        expect(summary.metrics.find((metric) => metric.key === "accuracy")?.caption).toBe("Tuning");
    });

    it("calls out positive progress as rising rhythm", () => {
        const summary = typingStyleSummary(proof({ thirtyDayDelta: 4.2 }));

        expect(summary.title).toBe("Rising rhythm");
        expect(summary.metrics.find((metric) => metric.key === "momentum")?.caption).toBe("Climbing");
        expect(summary.metrics.find((metric) => metric.key === "momentum")?.displayValue).toBe("+4.2 WPM");
    });

    it("shows raw profile values alongside normalized style scores", () => {
        const summary = typingStyleSummary(proof({
            recentWpm: 84.6,
            recentAccuracy: 97.4,
            recentConsistency: 82.1,
            thirtyDayDelta: 4.2,
        }));

        expect(summary.metrics.find((metric) => metric.key === "speed")?.displayValue).toBe("84.6 WPM");
        expect(summary.metrics.find((metric) => metric.key === "accuracy")?.displayValue).toBe("97.4%");
        expect(summary.metrics.find((metric) => metric.key === "consistency")?.displayValue).toBe("82.1%");
        expect(summary.baselineMetrics.find((metric) => metric.key === "speed")?.displayValue).toBe("65 WPM");
    });

    it("labels the strongest progress signal", () => {
        const summary = typingStyleSummary(proof({
            baselineWpm: 65,
            recentWpm: 84.6,
            baselineAccuracy: 96,
            recentAccuracy: 97.4,
            baselineConsistency: 80,
            recentConsistency: 82.1,
        }));

        expect(summary.insight.title).toBe("Speed lift");
        expect(summary.insight.body).toContain("+19.6 WPM");
    });

    it("uses rebuilding language for negative momentum", () => {
        const summary = typingStyleSummary(proof({ thirtyDayDelta: -3 }));

        expect(summary.metrics.find((metric) => metric.key === "momentum")?.caption).toBe("Rebuilding");
    });
});
