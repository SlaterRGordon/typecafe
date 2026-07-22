import { parseCoachingTarget, sameCoachingTarget, type CoachingTarget } from "./coachingTarget"
import { normalizePracticeWord } from "./practiceItem"

export const EVIDENCE_CONTEXTS = [
    "natural",
    "diagnostic",
    "acquisition",
    "train",
    "grams",
    "custom-practice",
] as const

export type EvidenceContext = typeof EVIDENCE_CONTEXTS[number]

export type TypingSurface = "test" | "drill" | "train"

export const PRACTICE_RECORD_VERSION = 1 as const
export const PRACTICE_TEXT_STYLES = ["varied", "pseudo"] as const
export const PRACTICE_DURATIONS_SECONDS = [30, 60, 120, 240] as const

export type PracticeTextStyle = typeof PRACTICE_TEXT_STYLES[number]
export type PracticeDurationSeconds = typeof PRACTICE_DURATIONS_SECONDS[number]
export type PracticeFocus =
    | { kind: "keys", items: string[] }
    | { kind: "grams", items: string[] }

interface PracticeRecordBase {
    v: typeof PRACTICE_RECORD_VERSION
    focus: PracticeFocus
    textStyle: PracticeTextStyle
    durationSeconds: PracticeDurationSeconds
    elapsedActivityMs: number
    completed: boolean
}

export type PracticeRecord =
    | (PracticeRecordBase & { kind: "guided", target: CoachingTarget })
    | (PracticeRecordBase & { kind: "custom" })

export interface PracticeComparisonEvidence {
    id: string
    completedAt: number
    practice: PracticeRecord | null
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function validFocus(value: unknown): PracticeFocus | null {
    const focus = record(value)
    if (!focus || (focus.kind !== "keys" && focus.kind !== "grams") || !Array.isArray(focus.items)) return null
    const maxLength = focus.kind === "keys" ? 8 : 24
    if (focus.items.length < 1 || focus.items.length > maxLength) return null
    if (!focus.items.every((item): item is string => {
        if (typeof item !== "string" || item.length === 0) return false
        const length = [...item].length
        if (focus.kind === "keys") return length <= 4
        return length <= 4 || (length <= 32 && normalizePracticeWord(item) === item)
    })) return null
    if (new Set(focus.items).size !== focus.items.length) return null
    return { kind: focus.kind, items: [...focus.items] }
}

/** Parse the additive JSON contract stored beside a Test Timeline. */
export function parsePracticeRecord(value: unknown): PracticeRecord | null {
    const raw = record(value)
    if (!raw || raw.v !== PRACTICE_RECORD_VERSION || (raw.kind !== "guided" && raw.kind !== "custom")) return null
    const focus = validFocus(raw.focus)
    if (!focus || !PRACTICE_TEXT_STYLES.includes(raw.textStyle as PracticeTextStyle)) return null
    if (!PRACTICE_DURATIONS_SECONDS.includes(raw.durationSeconds as PracticeDurationSeconds)) return null
    if (!Number.isInteger(raw.elapsedActivityMs) || (raw.elapsedActivityMs as number) < 0 || (raw.elapsedActivityMs as number) > 86_400_000) return null
    if (typeof raw.completed !== "boolean") return null

    const base: PracticeRecordBase = {
        v: PRACTICE_RECORD_VERSION,
        focus,
        textStyle: raw.textStyle as PracticeTextStyle,
        durationSeconds: raw.durationSeconds as PracticeDurationSeconds,
        elapsedActivityMs: raw.elapsedActivityMs as number,
        completed: raw.completed,
    }
    if (raw.kind === "custom") return raw.target === undefined ? { ...base, kind: "custom" } : null
    const target = parseCoachingTarget(raw.target)
    return target ? { ...base, kind: "guided", target } : null
}

export function practiceRecordMatchesEvidence(
    practice: PracticeRecord | null,
    context: EvidenceContext,
    attributedTarget: CoachingTarget | null,
): boolean {
    if (!practice) return context !== "custom-practice"
    if (practice.kind === "guided") {
        return context === "acquisition" && sameCoachingTarget(practice.target, attributedTarget ?? undefined)
    }
    return context === "custom-practice" && attributedTarget === null
}

/**
 * Previous timer-completed Practice runs eligible for a comparison. Duration
 * and elapsed activity are deliberately absent from cohort identity: they are
 * activity metadata, not performance evidence. The current record is excluded
 * by id and one prior run is enough to form a baseline.
 */
export function practiceComparisonWindow(
    evidence: readonly PracticeComparisonEvidence[],
    current: PracticeComparisonEvidence,
    item?: string,
): PracticeComparisonEvidence[] {
    const practice = current.practice
    if (!practice) return []
    return evidence
        .filter((candidate) => {
            if (candidate.id === current.id || candidate.completedAt > current.completedAt) return false
            const prior = candidate.practice
            if (!prior?.completed || prior.kind !== practice.kind || prior.textStyle !== practice.textStyle) return false
            if (practice.kind === "guided") {
                return prior.kind === "guided" && sameCoachingTarget(prior.target, practice.target)
            }
            return prior.kind === "custom" && item !== undefined && prior.focus.kind === practice.focus.kind && prior.focus.items.includes(item)
        })
        .sort((a, b) => b.completedAt - a.completedAt || b.id.localeCompare(a.id))
        .slice(0, 10)
}

export function parseEvidenceContext(value: unknown): EvidenceContext | null {
    return typeof value === "string" && EVIDENCE_CONTEXTS.includes(value as EvidenceContext)
        ? value as EvidenceContext
        : null
}

// Translate UI modes/routes at their boundary. TestModes.ngrams is 2; keeping
// the numeric wire value here avoids making the domain module depend on React.
export function evidenceContextForRun(input: { surface: TypingSurface, mode: number }): EvidenceContext {
    if (input.surface === "train") return "train"
    if (input.surface === "drill") return "acquisition"
    return input.mode === 2 ? "grams" : "natural"
}

// Rows created before evidenceContext existed are useful only when their old
// public-ranking contract proves they were ordinary normal Tests.
export function evidenceContextForStoredTest(input: {
    storedContext: unknown
    ranked: boolean
    mode: number
}): EvidenceContext | null {
    const stored = parseEvidenceContext(input.storedContext)
    if (stored) return stored
    return input.storedContext == null && input.ranked && input.mode === 0 ? "natural" : null
}

// Wire-level mirrors of discoversWeakness/updatesTargetResponse for SQL and
// storage filters that cannot call a predicate.
export const DISCOVERY_EVIDENCE_CONTEXTS = ["natural", "diagnostic"] as const
export const RESPONSE_EVIDENCE_CONTEXTS = ["acquisition"] as const

export function discoversWeakness(context: EvidenceContext | null): boolean {
    return context === "natural" || context === "diagnostic"
}

export function updatesTargetResponse(context: EvidenceContext | null): boolean {
    return context === "acquisition"
}

export function completedRunUpdatesTargetResponse(context: EvidenceContext | null, practice: PracticeRecord | null): boolean {
    return (practice?.completed ?? true) && updatesTargetResponse(context)
}

// Train and user-directed Grams attempts do not discover coaching Weaknesses.
// The remaining contexts retain chronology needed by current and future coach
// analysis, even when the attempt is intentionally unranked.
export function persistsSkillEvidence(context: EvidenceContext): boolean {
    return context !== "train" && context !== "grams"
}
