// One dated, frozen Coaching Prescription per language/stats pool. A targeted
// day checks due work cold, measures warm, acquires one Target, then verifies it
// in varied text. Only the target metric can prove Transfer; global WPM stays
// supporting context unless endurance itself is the Target.

import type { CoachingTarget, DrillPolicy } from "./coachingTarget"
import { parseCoachingTarget, sameCoachingTarget, targetAction, targetDisplayLabel } from "./coachingTarget"
import type { DrillDelta, KeyAttempts } from "./drillProgress"
import { nextDrillFinding } from "./drillProgress"
import { evidenceContextForCoachingStep, parseEvidenceContext, type EvidenceContext } from "./evidenceContext"
import type { SkillCandidate } from "./skillEvidence"
import type { TransitionAggregate } from "./transitions"

export const DAILY_COACHING_STORAGE_KEY = "typecafe:dailyCoaching"
export const DAILY_COACHING_UPDATED_EVENT = "typecafe:daily-coaching-updated"
export const GUEST_DAILY_SCOPE = "guest"

export type DailySessionKind = "calibration" | "targeted"
export type DailySessionStatus = "active" | "completed"
export type DailyStepKind = "baseline" | "calibration" | "recheck" | "focus" | "transfer"

export interface DailySet {
    completedAt: number
    netWpm: number
    accuracy: number
    targetDelta?: DrillDelta
    targetSamples?: number
}

export interface DailyStep {
    id: string
    kind: DailyStepKind
    context: EvidenceContext
    title: string
    detail: string
    href: string
    target?: CoachingTarget
    // Absent on translated v2 snapshots. New Transfer/Cold steps require a
    // qualified target sample before they can advance.
    requiresTargetSample?: boolean
    sets: DailySet[]
}

export interface FrozenRecommendation {
    id: string
    target: CoachingTarget
    metric: "ms" | "%" | "wpm"
    direction: "lower" | "higher"
    // Target performance before today's practice, not the generic comparator.
    baseline: number
    weaknessThreshold: number
    minimumChange: number
    impactMsPer1000: number
    confidence: number
    sampleCount: number
    distinctTests: number
    distinctWords: number
    reasonCode: string
    reason: string
    seenWords: string[]
}

export interface YesterdayOutcome {
    label: string
    target: CoachingTarget
    unit: "ms" | "%" | "wpm"
    before: number
    after: number
    minimumChange: number
}

export interface DailyCoachingSession {
    version: 3
    id: string
    dateKey: string
    pool: string
    language: string
    kind: DailySessionKind
    reason: string
    estimatedMinutes: number
    status: DailySessionStatus
    currentStepIndex: number
    steps: DailyStep[]
    prescription?: FrozenRecommendation
    yesterday?: YesterdayOutcome
    createdAt: number
    updatedAt: number
}

export interface DailySessionContext {
    dateKey: string
    pool: string
    language: string
}

export interface CreateDailySessionInput extends DailySessionContext {
    attempts: KeyAttempts
    transitions: TransitionAggregate[]
    recommendation?: SkillCandidate | null
    // Historical derivation feeds a qualifying regression back through normal
    // Impact ranking before this frozen Prescription is created.
    regressedRecommendation?: SkillCandidate | null
    // A regressed historical Target already has a frozen measurement contract.
    // Reuse it instead of reconstructing a candidate from sparse Cold evidence.
    regressedPrescription?: FrozenRecommendation | null
    // A due Target is a valid fallback Prescription when no current Weakness is
    // supported; the user should check the gain, not be sent to calibration.
    duePrescription?: FrozenRecommendation | null
    yesterday?: YesterdayOutcome | null
    now?: number
}

export const FOCUS_SETS_GOAL = 3
export const FOCUS_IMPROVED_GOAL = 2

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_STEPS = 5
const MAX_SETS = 12
const MAX_STRING = 400

export function localDateKey(date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

export function previousDateKey(dateKey: string): string {
    const [year, month, day] = dateKey.split("-").map(Number)
    return localDateKey(new Date(year!, month! - 1, day! - 1))
}

export function msUntilNextLocalDate(date = new Date()): number {
    const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    return Math.max(0, tomorrow.getTime() - date.getTime())
}

function sessionId(context: DailySessionContext): string {
    return [context.dateKey, context.pool, context.language].map(encodeURIComponent).join(":")
}

export function targetLabel(target: CoachingTarget): string {
    return targetDisplayLabel(target)
}

export function targetHref(target: CoachingTarget, policy: DrillPolicy = "acquisition", seenWords: readonly string[] = []): string {
    return targetAction(target, policy, { length: 30, seenWords }).href
}

export function targetMatchesDrill(
    step: Pick<DailyStep, "target" | "context">,
    drill: { target?: CoachingTarget, policy: DrillPolicy },
): boolean {
    return !!step.target && sameCoachingTarget(step.target, drill.target) && step.context === drill.policy
}

export function measureQualifies(kind: DailyStepKind, run: { subMode: "timed" | "words", count: number }): boolean {
    if (kind === "baseline") return run.subMode === "timed" ? run.count >= 30 : run.count >= 25
    if (kind === "calibration") return run.subMode === "timed" ? run.count >= 60 : run.count >= 50
    return false
}

function formatOutcome(outcome: YesterdayOutcome, value: number): string {
    return outcome.unit === "ms" ? `${Math.round(value)}ms` : outcome.unit === "wpm" ? `${value.toFixed(1)} WPM` : `${value.toFixed(1)}%`
}

function reasonForCandidate(candidate: SkillCandidate): string {
    const label = targetLabel(candidate.target)
    const impact = ` That costs about ${(candidate.impactMsPer1000 / 1_000).toFixed(1)}s per 1,000 characters.`
    const reason = candidate.reason
    if (reason.code === "transition_latency_above_baseline") return `Your ${label} transition is ${reason.ratio.toFixed(1)}× slower than your typical transition.${impact}`
    if (reason.code === "transition_error_rate_high") return `Your ${label} transition missed ${reason.errorRatePct.toFixed(0)}% of recent natural attempts.${impact}`
    if (reason.code === "key_latency_above_baseline") return `Your ${label} key arrives ${reason.ratio.toFixed(1)}× slower than your typical key.${impact}`
    if (reason.code === "key_accuracy_below_threshold") return `Your ${label} key was ${reason.accuracyPct.toFixed(0)}% accurate in recent natural typing.${impact}`
    if (reason.code === "correction_confusion_recurs") return `You corrected ${reason.typed} when ${reason.expected} was expected ${reason.errors} times.${impact}`
    if (reason.code === "gram_internal_latency_high") return `The ${label} pattern is costing the most time across several words.${impact}`
    if (reason.code === "word_internal_latency_high") return `${label} is your highest-Impact recurring word pattern.${impact}`
    if (reason.code === "movement_latency_high") return `This movement across ${reason.anchors.slice(0, 3).join(", ")} is slower than your usual flow.${impact}`
    return `Your longer matched Tests fade by ${reason.gapWpm.toFixed(1)} WPM.${impact}`
}

function seenWordsFor(candidate: SkillCandidate): string[] {
    if (candidate.reason.code === "gram_internal_latency_high") return candidate.reason.carrierWords.slice(0, 40)
    if (candidate.reason.code === "word_internal_latency_high") return candidate.reason.words.slice(0, 40)
    return []
}

function freezeCandidate(candidate: SkillCandidate): FrozenRecommendation {
    const noiseFloor = candidate.metric === "ms" ? 10 : 1
    return {
        id: candidate.id,
        target: candidate.target,
        metric: candidate.metric,
        direction: candidate.direction,
        baseline: candidate.observed,
        weaknessThreshold: candidate.baseline,
        minimumChange: Math.max(noiseFloor, Math.abs(candidate.observed) * 0.05),
        impactMsPer1000: candidate.impactMsPer1000,
        confidence: candidate.confidence,
        sampleCount: candidate.sampleCount,
        distinctTests: candidate.distinctTests,
        distinctWords: candidate.distinctWords,
        reasonCode: candidate.reason.code,
        reason: reasonForCandidate(candidate),
        seenWords: seenWordsFor(candidate),
    }
}

function legacyPrescription(input: CreateDailySessionInput): FrozenRecommendation | null {
    const finding = nextDrillFinding(input.transitions, input.attempts)
    if (!finding) return null
    if (finding.kind === "transition") {
        const aggregate = input.transitions.find((item) => item.pair === finding.pair)
        if (!aggregate?.count) return null
        const observed = aggregate.totalMs / aggregate.count
        const target: CoachingTarget = { kind: "transition", pair: finding.pair, metric: "latency" }
        return {
            id: finding.id, target, metric: "ms", direction: "lower", baseline: observed,
            weaknessThreshold: observed / finding.ratio, minimumChange: Math.max(10, observed * 0.05),
            impactMsPer1000: 0, confidence: 0.5, sampleCount: aggregate.count,
            distinctTests: 0, distinctWords: 0, reasonCode: "legacy_transition_latency",
            reason: `Your ${targetLabel(target)} transition is ${finding.ratio.toFixed(1)}× slower than your typical transition.`,
            seenWords: [],
        }
    }
    const totals = finding.keys.reduce((sum, key) => {
        const value = input.attempts.get(key)
        return { attempts: sum.attempts + (value?.attempts ?? 0), correct: sum.correct + (value?.correct ?? 0) }
    }, { attempts: 0, correct: 0 })
    if (!totals.attempts) return null
    const observed = totals.correct / totals.attempts * 100
    const target: CoachingTarget = { kind: "key", keys: finding.keys, metric: "accuracy" }
    return {
        id: finding.id, target, metric: "%", direction: "higher", baseline: observed,
        weaknessThreshold: 95, minimumChange: Math.max(1, observed * 0.05), impactMsPer1000: 0,
        confidence: 0.5, sampleCount: totals.attempts, distinctTests: 0, distinctWords: 0,
        reasonCode: "legacy_key_accuracy", reason: `Your weakest recent keys are ${finding.keys.join(" ")}.`, seenWords: [],
    }
}

export function createDailySession(input: CreateDailySessionInput): DailyCoachingSession {
    const id = sessionId(input)
    const now = input.now ?? Date.now()
    const selected = input.regressedRecommendation ?? input.recommendation ?? null
    const candidatePrescription = selected ? freezeCandidate(selected) : null
    // Regression re-enters normal Impact ranking; it is not permanently pinned
    // ahead of a more costly current Weakness.
    const rankedPrescription = input.regressedPrescription &&
        (!candidatePrescription || input.regressedPrescription.impactMsPer1000 >= candidatePrescription.impactMsPer1000)
        ? input.regressedPrescription
        : candidatePrescription
    const prescription = rankedPrescription ??
        input.duePrescription ?? legacyPrescription(input)
    const yesterday = input.yesterday ?? undefined

    if (!prescription) {
        return {
            version: 3, id, dateKey: input.dateKey, pool: input.pool, language: input.language,
            kind: "calibration",
            reason: "I’m still learning how you type. One longer Test gives me enough repeated keys and transitions to find a stable weakness — you’ll see your first finding the moment you finish.",
            estimatedMinutes: 2, status: "active", currentStepIndex: 0,
            steps: [{
                id: `${id}:calibration`, kind: "calibration", context: evidenceContextForCoachingStep("calibration"),
                title: "Map your typing", detail: "One 60-second Test (or 50+ words). Any normal Test that long counts automatically.",
                href: "/?mode=timed&count=60", sets: [],
            }],
            createdAt: now, updatedAt: now,
        }
    }

    const target = prescription.target
    const label = targetLabel(target)
    const coldLead = yesterday
        ? ` First, check ${yesterday.label} cold against its frozen ${formatOutcome(yesterday, yesterday.before)} baseline.`
        : ""
    const reason = `${prescription.reason}${coldLead} Then acquire ${label} in focused sets and prove it in varied text.`
    const steps: DailyStep[] = []

    if (yesterday) {
        steps.push({
            id: `${id}:recheck`, kind: "recheck", context: "cold", title: `Cold check ${yesterday.label}`,
            detail: "One varied set before practice. It counts only with enough target samples.",
            href: targetHref(yesterday.target, "cold"), target: yesterday.target, requiresTargetSample: true, sets: [],
        })
    }
    steps.push({
        id: `${id}:baseline`, kind: "baseline", context: "natural", title: "Warm measure: 30-second Test",
        detail: "Any normal Test of 30+ seconds (or 25+ words) counts automatically.", href: "/?mode=timed&count=30", sets: [],
    })
    steps.push({
        id: `${id}:focus`, kind: "focus", context: "acquisition", title: `Acquire ${label}`,
        detail: "Focused sets: clear the frozen improvement threshold twice, or stop after three sets.",
        href: targetHref(target, "acquisition", prescription.seenWords), target, sets: [],
    })
    steps.push({
        id: `${id}:transfer`, kind: "transfer", context: "transfer", title: `Transfer ${label}`,
        detail: "One varied set with new carriers. Warm practice alone cannot prove this step.",
        href: targetHref(target, "transfer", prescription.seenWords), target, requiresTargetSample: true, sets: [],
    })

    return {
        version: 3, id, dateKey: input.dateKey, pool: input.pool, language: input.language,
        kind: "targeted", reason, estimatedMinutes: yesterday ? 7 : 6, status: "active", currentStepIndex: 0,
        steps, prescription, ...(yesterday ? { yesterday } : {}), createdAt: now, updatedAt: now,
    }
}

export function currentDailyStep(session: DailyCoachingSession): DailyStep | null {
    if (session.status === "completed") return null
    return session.steps[session.currentStepIndex] ?? null
}

export function stepGoalMet(step: DailyStep): boolean {
    if (step.kind === "focus") {
        const improved = step.sets.filter((set) => set.targetDelta?.improved).length
        return improved >= FOCUS_IMPROVED_GOAL || step.sets.length >= FOCUS_SETS_GOAL
    }
    if (step.requiresTargetSample) return step.sets.some((set) => !!set.targetDelta)
    return step.sets.length >= 1
}

export function completedSetCount(session: DailyCoachingSession): number {
    return session.steps.reduce((sum, step) => sum + step.sets.length, 0)
}

export function recordDailySet(
    session: DailyCoachingSession,
    stepId: string,
    set: Omit<DailySet, "completedAt"> & { completedAt?: number },
): DailyCoachingSession {
    if (session.status !== "active") return session
    const active = currentDailyStep(session)
    if (!active || active.id !== stepId) return session
    if (!Number.isFinite(set.netWpm) || !Number.isFinite(set.accuracy)) return session
    if (active.requiresTargetSample && !set.targetDelta) return session
    if (active.sets.length >= MAX_SETS) return session

    const completedAt = set.completedAt ?? Date.now()
    const steps = session.steps.map((step) => step.id === stepId
        ? { ...step, sets: [...step.sets, { ...set, completedAt }] }
        : step)
    const stepDone = stepGoalMet(steps[session.currentStepIndex]!)
    const nextIndex = stepDone ? session.currentStepIndex + 1 : session.currentStepIndex
    const done = nextIndex >= steps.length
    return {
        ...session, steps, status: done ? "completed" : "active",
        currentStepIndex: done ? steps.length - 1 : nextIndex, updatedAt: completedAt,
    }
}

export function focusStep(session: DailyCoachingSession): DailyStep | null {
    return session.steps.find((step) => step.kind === "focus") ?? null
}

export function transferStep(session: DailyCoachingSession): DailyStep | null {
    return session.steps.find((step) => step.kind === "transfer") ?? null
}

export function baselineResult(session: DailyCoachingSession): DailySet | null {
    const step = session.steps.find((item) => item.kind === "baseline" || item.kind === "calibration")
    return step?.sets[0] ?? null
}

function bestDelta(session: DailyCoachingSession, step: DailyStep | null): DrillDelta | null {
    if (!step) return null
    const deltas = step.sets.map((set) => set.targetDelta).filter((delta): delta is DrillDelta => !!delta)
    if (!deltas.length) return null
    const direction = session.prescription?.direction ?? (deltas[0]!.unit === "ms" ? "lower" : "higher")
    return deltas.reduce((best, next) => direction === "lower"
        ? (next.after < best.after ? next : best)
        : (next.after > best.after ? next : best))
}

export function focusProof(session: DailyCoachingSession): DrillDelta | null {
    return bestDelta(session, focusStep(session))
}

export function transferProof(session: DailyCoachingSession): DrillDelta | null {
    return bestDelta(session, transferStep(session))
}

export function yesterdayOutcomeFrom(session: DailyCoachingSession | null): YesterdayOutcome | null {
    if (!session) return null
    const step = transferStep(session)
    const proof = step && stepGoalMet(step) ? transferProof(session) : null
    if (!step?.target || !proof?.improved) return null
    return {
        label: proof.label, target: step.target, unit: proof.unit, before: proof.before, after: proof.after,
        minimumChange: session.prescription?.minimumChange ?? 0,
    }
}

export interface ColdCheckResult {
    value: number
    unit: "ms" | "%" | "wpm"
    held: boolean
    yesterday: YesterdayOutcome
}

export function coldCheck(session: DailyCoachingSession): ColdCheckResult | null {
    const yesterday = session.yesterday
    if (!yesterday) return null
    const recheck = session.steps.find((step) => step.kind === "recheck")
    const delta = recheck?.sets[0]?.targetDelta
    if (!delta || delta.unit !== yesterday.unit) return null
    const held = yesterday.unit === "ms"
        ? delta.after <= yesterday.before - yesterday.minimumChange
        : delta.after >= yesterday.before + yesterday.minimumChange
    return { value: delta.after, unit: yesterday.unit, held, yesterday }
}

export function measureEnduranceDailyStep(
    session: DailyCoachingSession,
    step: DailyStep,
    netWpm: number,
): Pick<DailySet, "targetDelta" | "targetSamples"> | null {
    const prescription = session.prescription
    if (!prescription || step.target?.kind !== "endurance" || !sameCoachingTarget(step.target, prescription.target)) return null
    const improved = netWpm >= prescription.baseline + prescription.minimumChange
    return {
        targetSamples: 1,
        targetDelta: {
            label: targetLabel(step.target), before: prescription.baseline, after: netWpm,
            unit: "wpm", direction: "higher", improved,
        },
    }
}

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function shortString(value: unknown): value is string {
    return typeof value === "string" && value.length <= MAX_STRING
}

function parseLegacyTarget(value: unknown): CoachingTarget | null {
    const current = parseCoachingTarget(value)
    if (current) return current
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (raw.kind === "transition" && typeof raw.pair === "string" && [...raw.pair].length === 2) {
        return { kind: "transition", pair: raw.pair, metric: "latency" }
    }
    if (raw.kind === "keys" && Array.isArray(raw.keys) && raw.keys.length > 0 && raw.keys.length <= 8 &&
        raw.keys.every((key): key is string => typeof key === "string" && [...key].length === 1)) {
        return { kind: "key", keys: raw.keys, metric: "accuracy" }
    }
    return null
}

function parseDelta(value: unknown): DrillDelta | undefined {
    if (!value || typeof value !== "object") return undefined
    const delta = value as Record<string, unknown>
    if (shortString(delta.label) && finiteNumber(delta.before) && finiteNumber(delta.after) &&
        (delta.unit === "ms" || delta.unit === "%" || delta.unit === "wpm") &&
        (delta.direction === undefined || delta.direction === "lower" || delta.direction === "higher") && typeof delta.improved === "boolean") {
        return {
            label: delta.label, before: delta.before, after: delta.after, unit: delta.unit,
            ...(delta.direction ? { direction: delta.direction } : {}), improved: delta.improved,
        }
    }
    return undefined
}

function parseSet(value: unknown): DailySet | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (!finiteNumber(raw.completedAt) || !finiteNumber(raw.netWpm) || !finiteNumber(raw.accuracy)) return null
    const targetDelta = parseDelta(raw.targetDelta)
    if (raw.targetDelta !== undefined && !targetDelta) return null
    if (raw.targetSamples !== undefined && (!Number.isInteger(raw.targetSamples) || (raw.targetSamples as number) < 0)) return null
    return {
        completedAt: raw.completedAt, netWpm: raw.netWpm, accuracy: raw.accuracy,
        ...(targetDelta ? { targetDelta } : {}), ...(raw.targetSamples !== undefined ? { targetSamples: raw.targetSamples as number } : {}),
    }
}

function parseYesterday(value: unknown): YesterdayOutcome | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    const target = parseLegacyTarget(raw.target)
    if (!target || !shortString(raw.label) || (raw.unit !== "ms" && raw.unit !== "%" && raw.unit !== "wpm") ||
        !finiteNumber(raw.before) || !finiteNumber(raw.after) ||
        (raw.minimumChange !== undefined && (!finiteNumber(raw.minimumChange) || raw.minimumChange < 0))) return null
    return {
        label: raw.label, target, unit: raw.unit, before: raw.before, after: raw.after,
        minimumChange: (raw.minimumChange as number | undefined) ?? 0,
    }
}

function parsePrescription(value: unknown): FrozenRecommendation | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    const target = parseCoachingTarget(raw.target)
    if (!target || !shortString(raw.id) || (raw.metric !== "ms" && raw.metric !== "%" && raw.metric !== "wpm") ||
        (raw.direction !== "lower" && raw.direction !== "higher") || !finiteNumber(raw.baseline) ||
        !finiteNumber(raw.weaknessThreshold) || !finiteNumber(raw.minimumChange) || raw.minimumChange < 0 ||
        !finiteNumber(raw.impactMsPer1000) || !finiteNumber(raw.confidence) || !Number.isInteger(raw.sampleCount) ||
        !Number.isInteger(raw.distinctTests) || !Number.isInteger(raw.distinctWords) || !shortString(raw.reasonCode) ||
        !shortString(raw.reason) || !Array.isArray(raw.seenWords) || raw.seenWords.length > 40 ||
        !raw.seenWords.every((word): word is string => typeof word === "string" && word.length <= 80)) return null
    return {
        id: raw.id, target, metric: raw.metric, direction: raw.direction, baseline: raw.baseline,
        weaknessThreshold: raw.weaknessThreshold, minimumChange: raw.minimumChange,
        impactMsPer1000: raw.impactMsPer1000, confidence: raw.confidence,
        sampleCount: raw.sampleCount as number, distinctTests: raw.distinctTests as number, distinctWords: raw.distinctWords as number,
        reasonCode: raw.reasonCode, reason: raw.reason, seenWords: raw.seenWords,
    }
}

export function parseDailySession(value: unknown): DailyCoachingSession | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if ((raw.version !== 2 && raw.version !== 3) || !shortString(raw.id) || typeof raw.dateKey !== "string" || !DATE_KEY_RE.test(raw.dateKey) ||
        !shortString(raw.pool) || !shortString(raw.language) || (raw.kind !== "calibration" && raw.kind !== "targeted") ||
        !shortString(raw.reason) || !finiteNumber(raw.estimatedMinutes) || (raw.status !== "active" && raw.status !== "completed") ||
        !Number.isInteger(raw.currentStepIndex) || !finiteNumber(raw.createdAt) || !finiteNumber(raw.updatedAt) ||
        !Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > MAX_STEPS) return null

    const yesterday = raw.yesterday === undefined ? undefined : parseYesterday(raw.yesterday)
    if (raw.yesterday !== undefined && !yesterday) return null
    const prescription = raw.prescription === undefined ? undefined : parsePrescription(raw.prescription)
    if (raw.prescription !== undefined && !prescription) return null

    const steps: DailyStep[] = []
    for (const item of raw.steps) {
        if (!item || typeof item !== "object") return null
        const step = item as Record<string, unknown>
        const kind = step.kind as DailyStepKind
        const context = step.context === undefined
            ? kind === "transfer" ? "transfer" : evidenceContextForCoachingStep(kind)
            : parseEvidenceContext(step.context)
        if (!shortString(step.id) || !["baseline", "calibration", "recheck", "focus", "transfer"].includes(kind) || !context ||
            !shortString(step.title) || !shortString(step.detail) || !shortString(step.href) || !Array.isArray(step.sets) || step.sets.length > MAX_SETS ||
            (step.requiresTargetSample !== undefined && typeof step.requiresTargetSample !== "boolean")) return null
        const target = step.target === undefined ? undefined : parseLegacyTarget(step.target)
        if (step.target !== undefined && !target) return null
        const sets: DailySet[] = []
        for (const rawSet of step.sets) {
            const set = parseSet(rawSet)
            if (!set) return null
            sets.push(set)
        }
        steps.push({
            id: step.id, kind, context, title: step.title, detail: step.detail, href: step.href,
            ...(target ? { target } : {}), ...(step.requiresTargetSample ? { requiresTargetSample: true } : {}), sets,
        })
    }

    const currentStepIndex = raw.currentStepIndex as number
    if (currentStepIndex < 0 || currentStepIndex >= steps.length) return null
    if (raw.status === "completed") {
        if (!steps.every(stepGoalMet)) return null
    } else {
        if (!steps.slice(0, currentStepIndex).every(stepGoalMet) || stepGoalMet(steps[currentStepIndex]!) ||
            !steps.slice(currentStepIndex + 1).every((step) => step.sets.length === 0)) return null
    }

    return {
        version: 3, id: raw.id, dateKey: raw.dateKey, pool: raw.pool, language: raw.language,
        kind: raw.kind, reason: raw.reason, estimatedMinutes: raw.estimatedMinutes, status: raw.status,
        currentStepIndex, steps, ...(prescription ? { prescription } : {}), ...(yesterday ? { yesterday } : {}),
        createdAt: raw.createdAt, updatedAt: raw.updatedAt,
    }
}

function storageKeyFor(scope: string): string {
    return `${DAILY_COACHING_STORAGE_KEY}:${encodeURIComponent(scope)}`
}

function resolveStorage(storage?: Storage): Storage | null {
    if (storage) return storage
    if (typeof window === "undefined") return null
    try { return window.localStorage } catch { return null }
}

function readAll(scope: string, storage?: Storage): DailyCoachingSession[] {
    const target = resolveStorage(storage)
    if (!target) return []
    try {
        const raw = target.getItem(storageKeyFor(scope))
        const values: unknown = raw ? JSON.parse(raw) : []
        if (!Array.isArray(values)) return []
        return values.map(parseDailySession).filter((item): item is DailyCoachingSession => item !== null)
    } catch { return [] }
}

export function readLocalDailySession(scope: string, context: DailySessionContext, storage?: Storage): DailyCoachingSession | null {
    return readAll(scope, storage).find((session) => session.dateKey === context.dateKey && session.pool === context.pool && session.language === context.language) ?? null
}

export function readLocalDailyHistory(
    scope: string,
    context: Pick<DailySessionContext, "pool" | "language">,
    storage?: Storage,
): DailyCoachingSession[] {
    return readAll(scope, storage)
        .filter((session) => session.pool === context.pool && session.language === context.language)
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.updatedAt - a.updatedAt)
}

export function writeLocalDailySession(scope: string, session: DailyCoachingSession, storage?: Storage): void {
    const target = resolveStorage(storage)
    if (!target) return
    const sessions = readAll(scope, storage).filter((item) => item.id !== session.id)
    sessions.push(session)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    try {
        // Thirty bounded snapshots cover the 1/3/7-practiced-day schedule while
        // remaining comfortably below normal localStorage limits.
        target.setItem(storageKeyFor(scope), JSON.stringify(sessions.slice(0, 30)))
        if (!storage && typeof window !== "undefined") window.dispatchEvent(new Event(DAILY_COACHING_UPDATED_EVENT))
    } catch { /* blocked storage leaves the live session usable */ }
}

export function clearLocalDailySessions(scope: string, storage?: Storage): void {
    const target = resolveStorage(storage)
    if (!target) return
    try { target.removeItem(storageKeyFor(scope)) } catch { /* blocked storage */ }
}

export function preferDailySession(local: DailyCoachingSession | null, remote: DailyCoachingSession | null): DailyCoachingSession | null {
    if (!local) return remote
    if (!remote) return local
    if (local.id !== remote.id) return local.updatedAt >= remote.updatedAt ? local : remote
    const localSets = completedSetCount(local)
    const remoteSets = completedSetCount(remote)
    if (localSets !== remoteSets) return localSets > remoteSets ? local : remote
    return local.updatedAt >= remote.updatedAt ? local : remote
}
