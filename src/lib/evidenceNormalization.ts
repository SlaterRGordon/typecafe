import type { GuestEvidenceTest } from "./guestEvidence"
import {
    discoversWeakness,
    evidenceContextForStoredTest,
    parsePracticeRecord,
    type EvidenceContext,
    type PracticeRecord,
} from "./evidenceContext"
import { statsPoolFor } from "./keyboardLayout"
import type { EncodedTimeline } from "./keystrokes"
import { baseTypeLanguage } from "./typeLanguage"

export const DEFAULT_EVIDENCE_HISTORY_LIMIT = 30
export const MAX_EVIDENCE_HISTORY_LIMIT = 90

export interface TimelineEvidence {
    completedAt: number
    context: EvidenceContext | null
    mode: number
    subMode: number
    count: number
    options: string
    punctuation: boolean
    capitals: boolean
    numbers: boolean
    layout: string
    pool: string
    language: string
    timeline: EncodedTimeline
    practice?: PracticeRecord | null
}

export interface StoredTimelineEvidence {
    createdAt: Date | number
    evidenceContext: unknown
    ranked: boolean
    count: number
    options: string
    punctuation: boolean
    capitals: boolean
    numbers: boolean
    layout: string
    timeline: EncodedTimeline
    practice?: unknown
    type: {
        mode: number
        subMode: number
        language: string
    }
}

function normalizedLanguage(language: string): string {
    return baseTypeLanguage(language) ?? language
}

/**
 * Bound the evidence history per context family, not overall: discovery
 * (natural/diagnostic) timelines and focused Practice response (acquisition)
 * timelines each keep their own newest `limit`. A run of focused drills must
 * never evict the natural evidence that weakness ranking, frequency, and
 * recency weighting are computed from — a shared cap made every Target's
 * estimated worth creep upward with practice volume alone.
 */
export function boundedEvidenceWindow(
    timelines: readonly TimelineEvidence[],
    limit = DEFAULT_EVIDENCE_HISTORY_LIMIT,
): TimelineEvidence[] {
    const sorted = [...timelines].sort((a, b) => b.completedAt - a.completedAt)
    const discovery: TimelineEvidence[] = []
    const response: TimelineEvidence[] = []
    const customPractice: TimelineEvidence[] = []
    for (const timeline of sorted) {
        const bucket = discoversWeakness(timeline.context)
            ? discovery
            : timeline.context === "custom-practice" ? customPractice : response
        if (bucket.length < limit) bucket.push(timeline)
    }
    return [...discovery, ...response, ...customPractice].sort((a, b) => b.completedAt - a.completedAt)
}

export function normalizeGuestTimelineEvidence(evidence: GuestEvidenceTest): TimelineEvidence {
    return {
        completedAt: evidence.completedAt,
        context: evidence.context,
        mode: evidence.config.mode,
        subMode: evidence.config.subMode,
        count: evidence.config.count,
        options: evidence.config.options,
        punctuation: evidence.config.punctuation,
        capitals: evidence.config.capitals,
        numbers: evidence.config.numbers,
        layout: evidence.config.layout,
        pool: statsPoolFor(evidence.config.layout),
        language: normalizedLanguage(evidence.config.language),
        timeline: evidence.timeline,
        practice: parsePracticeRecord(evidence.practice),
    }
}

export function normalizeStoredTimelineEvidence(evidence: StoredTimelineEvidence): TimelineEvidence {
    return {
        completedAt: typeof evidence.createdAt === "number" ? evidence.createdAt : evidence.createdAt.getTime(),
        context: evidenceContextForStoredTest({
            storedContext: evidence.evidenceContext,
            ranked: evidence.ranked,
            mode: evidence.type.mode,
        }),
        mode: evidence.type.mode,
        subMode: evidence.type.subMode,
        count: evidence.count,
        options: evidence.options,
        punctuation: evidence.punctuation,
        capitals: evidence.capitals,
        numbers: evidence.numbers,
        layout: evidence.layout,
        pool: statsPoolFor(evidence.layout),
        language: normalizedLanguage(evidence.type.language),
        timeline: evidence.timeline,
        practice: parsePracticeRecord(evidence.practice),
    }
}
