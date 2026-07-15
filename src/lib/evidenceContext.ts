export const EVIDENCE_CONTEXTS = [
    "natural",
    "diagnostic",
    "acquisition",
    "transfer",
    "cold",
    "train",
    "grams",
] as const

export type EvidenceContext = typeof EVIDENCE_CONTEXTS[number]

export type TypingSurface = "test" | "drill" | "train"
export type CoachingStepContext = "baseline" | "calibration" | "recheck" | "focus"

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

export function evidenceContextForCoachingStep(kind: CoachingStepContext): EvidenceContext {
    if (kind === "calibration") return "diagnostic"
    if (kind === "recheck") return "cold"
    if (kind === "focus") return "acquisition"
    return "natural"
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

export function discoversWeakness(context: EvidenceContext | null): boolean {
    return context === "natural" || context === "diagnostic"
}

export function updatesTargetResponse(context: EvidenceContext | null): boolean {
    return context === "acquisition" || context === "transfer" || context === "cold"
}

export function provesTransfer(context: EvidenceContext | null): boolean {
    return context === "transfer" || context === "cold"
}

export function provesMastery(context: EvidenceContext | null): boolean {
    return context === "cold"
}

// Train and user-directed Grams attempts do not discover coaching Weaknesses.
// The remaining contexts retain chronology needed by current and future coach
// analysis, even when the attempt is intentionally unranked.
export function persistsSkillEvidence(context: EvidenceContext): boolean {
    return context !== "train" && context !== "grams"
}
