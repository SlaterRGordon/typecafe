import { averageNet, netOf, type NetRow } from "./netScores";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_SAMPLE_SIZE = 10;

export interface ProfileProofRecord extends NetRow {
    consistency?: number | null;
    createdAt: Date;
}

export interface ProfileProofSummary {
    bestWpm: number | null;
    baselineWpm: number | null;
    baselineAccuracy: number | null;
    baselineConsistency: number | null;
    baselineCount: number;
    recentWpm: number | null;
    recentAccuracy: number | null;
    recentConsistency: number | null;
    thirtyDayDelta: number | null;
    recentCount: number;
}

function average(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNetRequired(records: ProfileProofRecord[]) {
    return averageNet(records) ?? 0;
}

function sparseProgressDelta(records: ProfileProofRecord[]) {
    if (records.length === 0) return null;
    if (records.length === 1) return 0;

    const splitIndex = Math.max(1, Math.floor(records.length / 2));
    const baseline = records.slice(0, splitIndex);
    const current = records.slice(splitIndex);

    return averageNetRequired(current) - averageNetRequired(baseline);
}

function averageConsistency(records: ProfileProofRecord[]) {
    return average(records
        .map((record) => record.consistency)
        .filter((value): value is number => typeof value === "number"));
}

function baselineRecords(records: ProfileProofRecord[], recentCount: number) {
    if (records.length <= 1) return [];

    if (records.length > recentCount) {
        const baselineEnd = records.length - recentCount;
        return records.slice(Math.max(0, baselineEnd - RECENT_SAMPLE_SIZE), baselineEnd);
    }

    return records.slice(0, Math.max(1, Math.floor(records.length / 2)));
}

export function profileProofSummary(records: ProfileProofRecord[], now = new Date()): ProfileProofSummary {
    const usable = records
        .filter((record) => record.createdAt.getTime() <= now.getTime())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (usable.length === 0) {
        return {
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
        };
    }

    const recent = usable.slice(-RECENT_SAMPLE_SIZE);
    const baseline = baselineRecords(usable, recent.length);
    const currentStart = now.getTime() - 30 * DAY_MS;
    const priorStart = now.getTime() - 60 * DAY_MS;
    const currentWindow = usable.filter((record) => record.createdAt.getTime() >= currentStart);
    const priorWindow = usable.filter((record) => {
        const time = record.createdAt.getTime();
        return time >= priorStart && time < currentStart;
    });
    const currentAverage = averageNet(currentWindow);
    const priorAverage = averageNet(priorWindow);
    const delta = currentAverage !== null && priorAverage !== null
        ? currentAverage - priorAverage
        : sparseProgressDelta(currentWindow.length > 0 ? currentWindow : usable);

    return {
        bestWpm: Math.max(...usable.map(netOf)),
        baselineWpm: averageNet(baseline),
        baselineAccuracy: average(baseline.map((record) => record.accuracy)),
        baselineConsistency: averageConsistency(baseline),
        baselineCount: baseline.length,
        recentWpm: averageNet(recent),
        recentAccuracy: average(recent.map((record) => record.accuracy)),
        recentConsistency: averageConsistency(recent),
        thirtyDayDelta: delta,
        recentCount: recent.length,
    };
}
