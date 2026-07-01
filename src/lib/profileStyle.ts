import type { ProfileProofSummary } from "./profileProof";

export type TypingStyleKey = "speed" | "accuracy" | "consistency" | "momentum";

export interface TypingStyleMetric {
    key: TypingStyleKey;
    label: string;
    value: number;
    displayValue: string;
    detail: string;
    caption: string;
    icon: string;
}

export interface TypingStyleSummary {
    title: string;
    message: string;
    metrics: TypingStyleMetric[];
    baselineMetrics: TypingStyleMetric[];
    hasBaseline: boolean;
    insight: {
        title: string;
        body: string;
        icon: string;
    };
}

function clamp(value: number, min = 0, max = 100) {
    return Math.min(max, Math.max(min, value));
}

function scoreFromWpm(wpm: number | null) {
    if (wpm === null) return 22;
    return clamp((wpm / 120) * 100, 20, 100);
}

function scoreFromAccuracy(accuracy: number | null) {
    if (accuracy === null) return 24;
    return clamp(accuracy, 20, 100);
}

function scoreFromConsistency(consistency: number | null) {
    if (consistency === null) return 24;
    return clamp(consistency, 20, 100);
}

function scoreFromDelta(delta: number | null) {
    if (delta === null) return 35;
    return clamp(50 + delta * 5, 20, 100);
}

function speedCaption(wpm: number | null) {
    if (wpm === null) return "Forming";
    if (wpm < 45) return "Warming up";
    if (wpm < 70) return "Quick";
    if (wpm < 95) return "Fast";
    return "Rapid";
}

function accuracyCaption(accuracy: number | null) {
    if (accuracy === null) return "Forming";
    if (accuracy < 94) return "Tuning";
    if (accuracy < 98) return "Clean";
    return "Precise";
}

function consistencyCaption(consistency: number | null) {
    if (consistency === null) return "Forming";
    if (consistency < 70) return "Settling";
    if (consistency < 85) return "Steady";
    return "Locked in";
}

function momentumCaption(delta: number | null) {
    if (delta === null) return "Forming";
    if (delta > 2) return "Climbing";
    if (delta >= -1) return "Stable";
    return "Rebuilding";
}

function formatMetric(value: number | null, suffix: string) {
    if (value === null) return "No data";
    return `${value.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

function formatDelta(value: number | null) {
    if (value === null) return "No data";
    const formatted = value.toFixed(1).replace(/\.0$/, "");
    return `${value > 0 ? "+" : ""}${formatted} WPM`;
}

function metricDelta(current: number | null, baseline: number | null, suffix: string) {
    if (current === null || baseline === null) return null;
    const delta = current - baseline;
    const formatted = Math.abs(delta).toFixed(1).replace(/\.0$/, "");
    return `${delta >= 0 ? "+" : "-"}${formatted}${suffix}`;
}

function makeMetrics(args: {
    wpm: number | null;
    accuracy: number | null;
    consistency: number | null;
    delta: number | null;
}): TypingStyleMetric[] {
    return [
        {
            key: "speed",
            label: "Speed",
            value: scoreFromWpm(args.wpm),
            displayValue: formatMetric(args.wpm, " WPM"),
            detail: "Avg WPM",
            caption: speedCaption(args.wpm),
            icon: "fa-gauge-high",
        },
        {
            key: "accuracy",
            label: "Accuracy",
            value: scoreFromAccuracy(args.accuracy),
            displayValue: formatMetric(args.accuracy, "%"),
            detail: "Avg accuracy",
            caption: accuracyCaption(args.accuracy),
            icon: "fa-bullseye",
        },
        {
            key: "consistency",
            label: "Consistency",
            value: scoreFromConsistency(args.consistency),
            displayValue: formatMetric(args.consistency, "%"),
            detail: "Avg consistency",
            caption: consistencyCaption(args.consistency),
            icon: "fa-wave-square",
        },
        {
            key: "momentum",
            label: "Momentum",
            value: scoreFromDelta(args.delta),
            displayValue: formatDelta(args.delta),
            detail: "30-day change",
            caption: momentumCaption(args.delta),
            icon: args.delta !== null && args.delta < -1 ? "fa-seedling" : "fa-arrow-trend-up",
        },
    ];
}

function progressInsight(proof: ProfileProofSummary | null | undefined) {
    const recentWpm = proof?.recentWpm ?? null;
    const baselineWpm = proof?.baselineWpm ?? null;
    const accuracy = proof?.recentAccuracy ?? null;
    const baselineAccuracy = proof?.baselineAccuracy ?? null;
    const consistency = proof?.recentConsistency ?? null;
    const baselineConsistency = proof?.baselineConsistency ?? null;
    const delta = proof?.thirtyDayDelta ?? null;

    type InsightCandidate = {
        score: number | null;
        title: string;
        body: string;
        icon: string;
    };

    const candidates: InsightCandidate[] = [
        {
            score: recentWpm !== null && baselineWpm !== null ? recentWpm - baselineWpm : null,
            title: "Speed lift",
            body: `Recent average is ${metricDelta(recentWpm, baselineWpm, " WPM") ?? "forming"} versus your earlier sample.`,
            icon: "fa-arrow-trend-up",
        },
        {
            score: accuracy !== null && baselineAccuracy !== null ? accuracy - baselineAccuracy : null,
            title: "Cleaner runs",
            body: `Accuracy is ${metricDelta(accuracy, baselineAccuracy, "%") ?? "forming"} versus your earlier sample.`,
            icon: "fa-bullseye",
        },
        {
            score: consistency !== null && baselineConsistency !== null ? consistency - baselineConsistency : null,
            title: "Steadier rhythm",
            body: `Consistency is ${metricDelta(consistency, baselineConsistency, "%") ?? "forming"} versus your earlier sample.`,
            icon: "fa-wave-square",
        },
    ];

    const scoredCandidates = candidates.filter((candidate): candidate is InsightCandidate & { score: number } => typeof candidate.score === "number");

    if ((proof?.baselineCount ?? 0) === 0 || scoredCandidates.length === 0) {
        return {
            title: "Progress shape forming",
            body: "Take a few more ranked tests and this chart will compare your earlier pattern to your recent one.",
            icon: "fa-chart-simple",
        };
    }

    const strongest = scoredCandidates.sort((a, b) => b.score - a.score)[0];
    if (strongest && strongest.score > 0) return strongest;

    if (delta !== null && delta >= 0) {
        return {
            title: "Holding steady",
            body: "Your recent shape is close to your baseline. Keep stacking clean reps and let the next delta move.",
            icon: "fa-equals",
        };
    }

    return {
        title: "Rebuild signal",
        body: "Your earlier sample is ahead in a few areas. A focused drill block can turn the next shape outward.",
        icon: "fa-seedling",
    };
}

export function typingStyleSummary(proof: ProfileProofSummary | null | undefined): TypingStyleSummary {
    const recentWpm = proof?.recentWpm ?? null;
    const accuracy = proof?.recentAccuracy ?? null;
    const consistency = proof?.recentConsistency ?? null;
    const delta = proof?.thirtyDayDelta ?? null;
    const hasTests = (proof?.recentCount ?? 0) > 0;
    const hasBaseline = (proof?.baselineCount ?? 0) > 0;
    const metrics = makeMetrics({ wpm: recentWpm, accuracy, consistency, delta });
    const baselineMetrics = makeMetrics({
        wpm: proof?.baselineWpm ?? null,
        accuracy: proof?.baselineAccuracy ?? null,
        consistency: proof?.baselineConsistency ?? null,
        delta: (proof?.baselineCount ?? 0) > 0 ? 0 : null,
    });
    const insight = progressInsight(proof);

    if (!hasTests) {
        return {
            title: "Style forming",
            message: "Take a ranked test to start shaping your profile.",
            metrics,
            baselineMetrics,
            hasBaseline,
            insight,
        };
    }

    if ((accuracy ?? 100) < 94) {
        return {
            title: "Quick hands",
            message: "Your speed is showing. Cleaner runs will make the WPM easier to keep.",
            metrics,
            baselineMetrics,
            hasBaseline,
            insight,
        };
    }

    if ((consistency ?? 100) < 70) {
        return {
            title: "Burst speed",
            message: "You have pace. A steadier rhythm will make your scores repeatable.",
            metrics,
            baselineMetrics,
            hasBaseline,
            insight,
        };
    }

    if ((delta ?? 0) > 2) {
        return {
            title: "Rising rhythm",
            message: "Your recent tests are moving up. Keep stacking clean reps.",
            metrics,
            baselineMetrics,
            hasBaseline,
            insight,
        };
    }

    if ((recentWpm ?? 0) >= 90 && (accuracy ?? 0) >= 97 && (consistency ?? 0) >= 80) {
        return {
            title: "Sharp typist",
            message: "Fast, clean, and steady. Protect the rhythm that is working.",
            metrics,
            baselineMetrics,
            hasBaseline,
            insight,
        };
    }

    return {
        title: "Steady builder",
        message: "Solid base. Keep measuring and let the next delta prove the gain.",
        metrics,
        baselineMetrics,
        hasBaseline,
        insight,
    };
}
