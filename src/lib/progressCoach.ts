import { targetAction, targetDisplayLabel, targetRepresentativeSequences, targetVisualKeys, type CoachingTarget } from "./coachingTarget"
import type { NaturalAbility, SkillAnalysis, SkillCandidate, SkillReason } from "./skillEvidence"
import { guidedEvidenceFromCandidate } from "./guidedPractice"

export type ProgressCoachState = "needs-work" | "calibrating"
export type ProgressCoachFilter = "all" | "transition" | "key" | "pattern" | "movement"
export type ProgressTargetFamily = Exclude<ProgressCoachFilter, "all"> | "correction" | "endurance"
type ProgressCoachCategory = Exclude<ProgressCoachFilter, "all"> | "other"

export interface ProgressCoachStage {
    key: "earlier" | "recent"
    label: "Earlier" | "Recent"
    value: string
    numericValue: number
    sampleCount: number
}

export interface ProgressCoachTrend {
    label: string
    arrow: "up" | "down"
    outcome: "good" | "bad"
}

export interface ProgressPracticeSummary {
    focusedTimeMs: number
    completedRuns: number
    sampleCount: number
    value: string | null
}

export type ProgressImpactTone = "urgent" | "material" | "moderate" | "minor"

/**
 * Four display bands for estimated cost. Relative rank spreads a meaningful
 * shortlist across the theme palette, while absolute floors prevent a tiny
 * lone Target from appearing urgent merely because it leads an empty list.
 */
export function progressImpactTone(impactMsPer1000: number | null, leadingImpactMsPer1000 = impactMsPer1000 ?? 0): ProgressImpactTone {
    const impact = impactMsPer1000 ?? 0
    const ratio = leadingImpactMsPer1000 > 0 ? impact / leadingImpactMsPer1000 : 0
    if (impact >= 1_200 && ratio >= 0.75) return "urgent"
    if (impact >= 700 && ratio >= 0.45) return "material"
    if (impact >= 300 && ratio >= 0.20) return "moderate"
    return "minor"
}

export interface ProgressCoachTarget {
    id: string
    target: CoachingTarget | null
    label: string
    family: ProgressTargetFamily | null
    typeLabel: string
    description: string
    visualKeys: string[]
    state: ProgressCoachState
    statusLabel: string
    headline: string
    detail: string
    stages: ProgressCoachStage[]
    direction: "lower" | "higher" | null
    metric: "ms" | "%" | "wpm" | null
    action: { href: string, label: string } | null
    episodeCount: number
    filter: ProgressCoachCategory
    lastEvidenceDate: string | null
    impactMsPer1000: number | null
    /** How the estimated worth moved between the earlier and recent windows. */
    worthDelta: ProgressCoachTrend | null
    trend: ProgressCoachTrend | null
    practice: ProgressPracticeSummary | null
    /** Drilled since its last natural evidence — the next step is a Test. */
    awaitingMeasurement: boolean
}

export interface ProgressCoachProjection {
    defaultTarget: ProgressCoachTarget
    targets: ProgressCoachTarget[]
    targetLimit: number
    /** Span of the discovery Tests the ledger is measured from. */
    evidenceWindow: { tests: number, fromMs: number, toMs: number } | null
}

const TARGET_LIMIT = 30
const CURRENT_WEAKNESS_LIMIT = 12
const LEADING_IMPACT_TARGETS = 3
const COMPARABLE_FAMILY_RATIO = 0.25

function targetKey(target: CoachingTarget): string {
    return JSON.stringify(target)
}

function movementLabel(movement: Extract<CoachingTarget, { kind: "movement" }>["movement"]): string {
    if (movement === "same-finger") return "same-finger"
    if (movement === "row-reach") return "row-reach"
    if (movement === "inward-roll") return "inward-roll"
    return "outward-roll"
}

function targetPresentation(target: CoachingTarget): Pick<ProgressCoachTarget, "family" | "typeLabel" | "description" | "visualKeys" | "filter"> {
    const family = targetFamily(target)
    if (target.kind === "key") return {
        family,
        typeLabel: "Key",
        description: target.metric === "accuracy"
            ? `low accuracy on ${target.keys.join(", ")}`
            : `${target.keys.join(", ")} arrives slowly`,
        visualKeys: targetVisualKeys(target),
        filter: "key",
    }
    if (target.kind === "transition") {
        const [from = "", to = ""] = [...target.pair]
        return {
            family,
            typeLabel: "Transition",
            description: target.metric === "accuracy"
                ? `low ${to} accuracy after ${from}`
                : `${from}→${to} pause is slow`,
            visualKeys: targetVisualKeys(target),
            filter: "transition",
        }
    }
    if (target.kind === "gram") return {
        family,
        typeLabel: "Pattern",
        description: `pause inside ${target.gram}`,
        visualKeys: targetVisualKeys(target),
        filter: "pattern",
    }
    if (target.kind === "word") {
        return {
            family,
            typeLabel: "Pattern",
            description: target.sharedGram
                ? `slow rhythm around ${target.sharedGram}`
                : "slow rhythm across these words",
            visualKeys: targetVisualKeys(target),
            filter: "pattern",
        }
    }
    if (target.kind === "movement") {
        return {
            family,
            typeLabel: "Movement",
            description: `${movementLabel(target.movement)} movement · ${targetRepresentativeSequences(target).join(", ")}`,
            visualKeys: targetVisualKeys(target),
            filter: "movement",
        }
    }
    if (target.kind === "correction") return {
        family,
        typeLabel: "Correction",
        description: `${target.typed} is repeatedly corrected to ${target.expected}`,
        visualKeys: targetVisualKeys(target),
        filter: "other",
    }
    return {
        family,
        typeLabel: "Endurance",
        description: `speed fades on ${target.longSeconds}s tests`,
        visualKeys: targetVisualKeys(target),
        filter: "other",
    }
}

function targetFamily(target: CoachingTarget): ProgressTargetFamily {
    if (target.kind === "gram" || target.kind === "word") return "pattern"
    return target.kind
}

/**
 * Keep the leading Targets honest to Impact, then surface the best comparable
 * Target from another supported family before filling the rest by Impact.
 * This prevents a long run of one evidence kind from hiding useful alternatives
 * without promoting a tiny pattern above a weakness that costs orders more.
 */
function selectCurrentWeaknesses(candidates: readonly SkillCandidate[], limit: number): SkillCandidate[] {
    if (limit <= 0 || candidates.length === 0) return []
    const ranked = [...candidates].sort((a, b) => b.impactMsPer1000 - a.impactMsPer1000
        || b.frequencyPer1000 - a.frequencyPer1000
        || b.confidence - a.confidence
        || a.id.localeCompare(b.id))
    const selected = ranked.slice(0, Math.min(LEADING_IMPACT_TARGETS, limit))
    const selectedIds = new Set(selected.map((candidate) => candidate.id))
    const selectedFamilies = new Set(selected.map((candidate) => targetFamily(candidate.target)))
    const comparableFloor = ranked[0]!.impactMsPer1000 * COMPARABLE_FAMILY_RATIO

    for (const candidate of ranked) {
        if (selected.length >= limit || candidate.impactMsPer1000 < comparableFloor) break
        const family = targetFamily(candidate.target)
        if (selectedIds.has(candidate.id) || selectedFamilies.has(family)) continue
        selected.push(candidate)
        selectedIds.add(candidate.id)
        selectedFamilies.add(family)
    }
    for (const candidate of ranked) {
        if (selected.length >= limit) break
        if (selectedIds.has(candidate.id)) continue
        selected.push(candidate)
        selectedIds.add(candidate.id)
    }
    return selected
}

function metricValue(value: number, metric: "ms" | "%" | "wpm"): string {
    if (metric === "ms") return `${Math.round(value)} ms`
    if (metric === "%") return `${value.toFixed(1)}%`
    return `${value.toFixed(1)} WPM`
}

// Every row's evidence line comes from the same place: the Target's own
// natural typing, split chronologically. Retired prescription baselines are
// history, not display data — coached and detected Targets read identically.
function abilityStages(ability: NaturalAbility | undefined, metric: "ms" | "%" | "wpm"): ProgressCoachStage[] {
    if (!ability) return []
    if (!ability.split) return [{
        key: "recent", label: "Recent", value: metricValue(ability.value, metric), numericValue: ability.value, sampleCount: ability.sampleCount,
    }]
    return [
        { key: "earlier", label: "Earlier", value: metricValue(ability.split.earlier, metric), numericValue: ability.split.earlier, sampleCount: ability.split.earlierSamples },
        { key: "recent", label: "Recent", value: metricValue(ability.split.recent, metric), numericValue: ability.split.recent, sampleCount: ability.split.recentSamples },
    ]
}

function abilityTrend(ability: NaturalAbility | undefined, direction: "lower" | "higher", metric: "ms" | "%" | "wpm"): ProgressCoachTrend | null {
    if (!ability?.split) return null
    return trendBetween(ability.split.earlier, ability.split.recent, direction, metric)
}

// The cost-carrying part of an observed value: excess latency for ms Targets,
// error rate for accuracy Targets, confusion rate for corrections. Impact is
// proportional to this term, so rescaling it re-anchors worth to a window.
function costBasis(value: number, metric: "ms" | "%" | "wpm", direction: "lower" | "higher", baseline: number): number {
    if (metric === "ms") return value - baseline
    if (metric === "%") return direction === "higher" ? 100 - value : value
    return 0
}

/**
 * Worth re-anchored to the same recent window as Ability and Progress, plus
 * how it moved since the earlier window. Detection and the underlying Impact
 * stay full-window (stable diagnosis); only the cost-carrying term is
 * rescaled, so the row's three numbers finally tell one story.
 */
function worthFor(candidate: SkillCandidate | null): { impactMsPer1000: number | null, worthDelta: ProgressCoachTrend | null } {
    if (!candidate || candidate.impactMsPer1000 <= 0) return { impactMsPer1000: null, worthDelta: null }
    const split = candidate.ability?.split
    const base = costBasis(candidate.observed, candidate.metric, candidate.direction, candidate.baseline)
    if (!split || base <= 0) return { impactMsPer1000: candidate.impactMsPer1000, worthDelta: null }
    const scale = (value: number) => candidate.impactMsPer1000 * Math.max(0, costBasis(value, candidate.metric, candidate.direction, candidate.baseline)) / base
    const recent = scale(split.recent)
    const earlier = scale(split.earlier)
    const deltaTenths = Math.round((recent - earlier) / 100)
    return {
        impactMsPer1000: recent,
        worthDelta: deltaTenths === 0 ? null : {
            label: `${Math.abs(deltaTenths / 10).toFixed(1)}s`,
            arrow: deltaTenths > 0 ? "up" : "down",
            outcome: deltaTenths > 0 ? "bad" : "good",
        },
    }
}

function trendBetween(before: number, after: number, direction: "lower" | "higher", metric: "ms" | "%" | "wpm"): ProgressCoachTrend | null {
    const delta = after - before
    const rounded = metric === "ms" ? Math.round(delta) : Math.round(delta * 10) / 10
    // A change below display resolution is no trend, not an arrow on "0 ms".
    if (rounded === 0) return null
    const amount = Math.abs(rounded).toFixed(metric === "ms" ? 0 : 1)
    const suffix = metric === "%" ? " %" : metric === "wpm" ? " WPM" : " ms"
    const improved = direction === "lower" ? delta < 0 : delta > 0
    return {
        label: `${amount}${suffix}`,
        arrow: delta >= 0 ? "up" : "down",
        outcome: improved ? "good" : "bad",
    }
}

const MEASURE_TEST_ACTION = { href: "/?mode=timed&count=30", label: "Take a Test" }

// Once a Target has been drilled, the loop closes in a normal Test. Target
// detail deliberately carries one next action, so measurement replaces Practice.
function nextAction(practice: { href: string, label: string }, awaiting: boolean): Pick<ProgressCoachTarget, "action" | "awaitingMeasurement"> {
    return awaiting
        ? { action: { ...MEASURE_TEST_ACTION }, awaitingMeasurement: true }
        : { action: practice, awaitingMeasurement: false }
}

function candidateDetail(reason: SkillReason): string {
    if (reason.code === "key_latency_above_baseline") return `Recent natural typing shows this key arriving ${reason.ratio.toFixed(1)}× slower than your typical key.`
    if (reason.code === "key_accuracy_below_threshold") return `Recent natural typing puts this key at ${reason.accuracyPct.toFixed(0)}% accuracy.`
    if (reason.code === "transition_latency_above_baseline") return `Recent natural typing shows this transition taking ${reason.ratio.toFixed(1)}× your typical transition time.`
    if (reason.code === "transition_error_rate_high") return `Recent natural typing missed this transition on ${reason.errorRatePct.toFixed(0)}% of attempts.`
    if (reason.code === "correction_confusion_recurs") return `You corrected this substitution ${reason.errors} times in recent natural typing.`
    if (reason.code === "gram_internal_latency_high") return `This pattern adds ${Math.round(reason.excessMs)} ms inside recent natural words.`
    if (reason.code === "word_internal_latency_high") return "These words are slower than your typical internal rhythm in recent natural typing."
    if (reason.code === "movement_latency_high") return "This movement is slower than your typical transition rhythm in recent natural typing."
    return `Your recent ${reason.longSeconds}s tests trail your ${reason.shortSeconds}s tests by ${reason.gapWpm.toFixed(1)} WPM.`
}

function candidateTarget(candidate: SkillCandidate): ProgressCoachTarget {
    const label = targetDisplayLabel(candidate.target)
    const action = targetAction(candidate.target, { length: 30, evidence: guidedEvidenceFromCandidate(candidate) })
    const presentation = targetPresentation(candidate.target)
    // Endurance (and any future sample-less kind) has no per-sample ability;
    // fall back to the observed value as a single Recent stage.
    const ability = candidate.ability ?? { value: candidate.observed, sampleCount: candidate.sampleCount }
    return {
        id: targetKey(candidate.target),
        target: candidate.target,
        label,
        ...presentation,
        state: "needs-work",
        statusLabel: "Needs work",
        headline: `Work on ${label}`,
        detail: candidateDetail(candidate.reason),
        stages: abilityStages(ability, candidate.metric),
        direction: candidate.direction,
        metric: candidate.metric,
        ...nextAction({ href: action.href, label: action.label }, candidate.awaitingMeasurement === true),
        episodeCount: 0,
        lastEvidenceDate: null,
        ...worthFor(candidate),
        trend: abilityTrend(candidate.ability, candidate.direction, candidate.metric),
        practice: candidate.practice ? {
            focusedTimeMs: candidate.practice.focusedTimeMs,
            completedRuns: candidate.practice.completedRuns,
            sampleCount: candidate.practice.sampleCount,
            value: candidate.practice.value === undefined ? null : metricValue(candidate.practice.value, candidate.metric),
        } : candidate.response ? {
            focusedTimeMs: 0,
            completedRuns: candidate.response.runCount,
            sampleCount: candidate.response.sampleCount,
            value: metricValue(candidate.response.value, candidate.metric),
        } : null,
    }
}

function calibrationTarget(): ProgressCoachTarget {
    return {
        id: "calibration",
        target: null,
        label: "Calibration",
        family: null,
        typeLabel: "Calibration",
        description: "Take a longer Test to rank a stable Target",
        visualKeys: [],
        state: "calibrating",
        statusLabel: "Building evidence",
        headline: "Map your typing to find a stable Target",
        detail: "One longer Test gives TypeCafe enough repeated natural evidence to rank a useful Target.",
        stages: [],
        direction: null,
        metric: null,
        action: { href: "/?mode=timed&count=60", label: "Start mapping Test" },
        episodeCount: 0,
        filter: "other",
        lastEvidenceDate: null,
        impactMsPer1000: null,
        worthDelta: null,
        trend: null,
        practice: null,
        awaitingMeasurement: false,
    }
}

/** Pure Progress view-model over current natural Weaknesses and Practice activity. */
export function projectProgressCoach(analysis: SkillAnalysis): ProgressCoachProjection {
    const targets = selectCurrentWeaknesses(analysis.candidates, CURRENT_WEAKNESS_LIMIT).map(candidateTarget)

    // The default detail follows the same Impact ordering as the ledger. There
    // is no separate prescribed Target; selecting any row is equally valid.
    const defaultTarget = targets[0] ?? calibrationTarget()
    return {
        defaultTarget,
        targets,
        targetLimit: TARGET_LIMIT,
        evidenceWindow: analysis.evidenceWindow,
    }
}

export function filterProgressCoachTargets(
    targets: readonly ProgressCoachTarget[],
    filter: ProgressCoachFilter,
): ProgressCoachTarget[] {
    return filter === "all" ? [...targets] : targets.filter((row) => row.filter === filter)
}
