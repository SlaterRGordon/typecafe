import type { DailyCoachingSession, FrozenRecommendation } from "./dailyCoaching"
import { sameCoachingTarget, targetAction, targetDisplayLabel, type CoachingTarget } from "./coachingTarget"
import type { MasteryRecord, SkillAnalysis, SkillCandidate, SkillReason, TargetProof } from "./skillEvidence"

export type ProgressCoachState = MasteryRecord["state"] | "needs-work" | "calibrating"
export type ProgressCoachFilter = "all" | "transition" | "key" | "pattern" | "movement"
export type ProgressTargetFamily = Exclude<ProgressCoachFilter, "all"> | "correction" | "endurance"
type ProgressCoachCategory = Exclude<ProgressCoachFilter, "all"> | "other"

export interface ProgressCoachStage {
    key: "baseline" | "practice" | "transfer" | "cold" | "recent"
    label: "Baseline" | "Practice" | "Transfer" | "Cold" | "Recent"
    value: string
    numericValue: number
    sampleCount: number
}

export interface ProgressCoachTrend {
    label: string
    arrow: "up" | "down"
    outcome: "good" | "bad" | "neutral"
}

export interface ProgressPracticeSummary {
    completedDrills: number
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

export interface ProgressCoachEpisode {
    id: string
    date: string
    statusLabel: string
    stages: ProgressCoachStage[]
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
    impact: string | null
    impactMsPer1000: number | null
    trend: ProgressCoachTrend | null
    trendSource: "ability" | "practice" | null
    practice: ProgressPracticeSummary | null
    episodes: ProgressCoachEpisode[]
}

export interface ProgressCoachProjection {
    defaultTarget: ProgressCoachTarget
    targets: ProgressCoachTarget[]
    targetLimit: number
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
        visualKeys: target.keys.slice(0, 4),
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
            visualKeys: [from, to].filter(Boolean),
            filter: "transition",
        }
    }
    if (target.kind === "gram") return {
        family,
        typeLabel: "Pattern",
        description: `pause inside ${target.gram}`,
        visualKeys: [...target.gram].slice(0, 4),
        filter: "pattern",
    }
    if (target.kind === "word") {
        const visual = target.sharedGram ?? target.words[0] ?? ""
        return {
            family,
            typeLabel: "Pattern",
            description: target.sharedGram
                ? `slow rhythm around ${target.sharedGram}`
                : "slow rhythm across these words",
            visualKeys: [...visual].slice(0, 4),
            filter: "pattern",
        }
    }
    if (target.kind === "movement") {
        const anchor = target.anchors[0] ?? ""
        const anchorLabel = [...anchor].join("→")
        return {
            family,
            typeLabel: "Movement",
            description: `${anchorLabel}${anchorLabel ? " · " : ""}${movementLabel(target.movement)} runs slow`,
            visualKeys: [...anchor].slice(0, 2),
            filter: "movement",
        }
    }
    if (target.kind === "correction") return {
        family,
        typeLabel: "Correction",
        description: `${target.typed} is repeatedly corrected to ${target.expected}`,
        visualKeys: [target.typed, target.expected],
        filter: "other",
    }
    return {
        family,
        typeLabel: "Endurance",
        description: `speed fades on ${target.longSeconds}s tests`,
        visualKeys: [],
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

function stagesFor(proof: TargetProof): ProgressCoachStage[] {
    const stages: ProgressCoachStage[] = [{
        key: "baseline",
        label: "Baseline",
        value: metricValue(proof.baseline, proof.metric),
        numericValue: proof.baseline,
        sampleCount: proof.sampleCounts.baseline,
    }]
    const recent = proof.cold !== undefined
        ? { value: proof.cold, samples: proof.sampleCounts.cold }
        : proof.transfer !== undefined
            ? { value: proof.transfer, samples: proof.sampleCounts.transfer }
            : null
    if (recent) stages.push({
        key: "recent", label: "Recent", value: metricValue(recent.value, proof.metric), numericValue: recent.value, sampleCount: recent.samples,
    })
    return stages
}

function trendBetween(before: number, after: number, direction: "lower" | "higher", metric: "ms" | "%" | "wpm"): ProgressCoachTrend {
    const delta = after - before
    const rounded = metric === "ms" ? Math.round(delta) : Math.round(delta * 10) / 10
    const amount = Math.abs(rounded).toFixed(metric === "ms" ? 0 : 1)
    const suffix = metric === "%" ? " %" : metric === "wpm" ? " WPM" : " ms"
    const improved = direction === "lower" ? delta < 0 : delta > 0
    return {
        label: `${amount}${suffix}`,
        arrow: delta >= 0 ? "up" : "down",
        outcome: delta === 0 ? "neutral" : improved ? "good" : "bad",
    }
}

function trendFor(stages: readonly ProgressCoachStage[], direction: "lower" | "higher" | null, metric: "ms" | "%" | "wpm" | null): ProgressCoachTrend | null {
    if (stages.length < 2 || !direction || !metric) return null
    return trendBetween(stages[0]!.numericValue, stages.at(-1)!.numericValue, direction, metric)
}

function directionFor(prescription: FrozenRecommendation): "lower" | "higher" {
    return prescription.direction
}

function statusCopy(state: MasteryRecord["state"], label: string, record: MasteryRecord): Pick<ProgressCoachTarget, "statusLabel" | "headline" | "detail"> {
    if (state === "due") return {
        statusLabel: "Ready to revisit",
        headline: `Practise ${label} again`,
        detail: "The earlier improvement is old enough to revisit. Practise directly; recent representative typing remains the ability score.",
    }
    if (state === "regressed") return {
        statusLabel: "Needs a refresh",
        headline: `Refresh ${label}`,
        detail: "Recent natural typing slipped past the earlier weakness threshold. A short focused drill is the useful next step.",
    }
    if (state === "retained") return {
        statusLabel: "Held",
        headline: `Your ${label} gain held`,
        detail: `${record.heldColdChecks} delayed ${record.heldColdChecks === 1 ? "check has" : "checks have"} held. You can still practise this Target whenever you want.${record.practicedDaysUntilDue ? ` Another check is useful after ${record.practicedDaysUntilDue} practised ${record.practicedDaysUntilDue === 1 ? "day" : "days"}.` : ""}`,
    }
    if (state === "transferred") return {
        statusLabel: "Improved",
        headline: `${label} improved in recent typing`,
        detail: "Representative typing improved beyond the focused drill. A later check will show whether the gain holds.",
    }
    return {
        statusLabel: "Practising",
        headline: `Keep building ${label}`,
        detail: "Focused practice has started. The recent ability score changes only when representative typing provides enough evidence.",
    }
}

function actionFor(record: MasteryRecord): ProgressCoachTarget["action"] {
    const action = targetAction(record.target, "acquisition", { length: 30, seenWords: record.prescription.seenWords })
    return { href: action.href, label: action.label }
}

function rowFromRecord(record: MasteryRecord, records: readonly MasteryRecord[], candidate: SkillCandidate | null): ProgressCoachTarget {
    const label = targetDisplayLabel(record.target)
    // A warm/varied result can coexist with a still-weak rolling natural score
    // on the same day. In that case the honest visible state is practising,
    // not improved; only representative evidence may support the latter.
    const state = record.state === "transferred" && candidate ? "training" : record.state
    const copy = statusCopy(state, label, record)
    const stages = stagesFor(record.proof)
    if (candidate?.metric === record.proof.metric) {
        const recent = { key: "recent" as const, label: "Recent" as const, value: metricValue(candidate.observed, candidate.metric), numericValue: candidate.observed, sampleCount: candidate.sampleCount }
        const recentIndex = stages.findIndex((stage) => stage.key === "recent")
        if (recentIndex >= 0) stages[recentIndex] = recent
        else stages.push(recent)
    }
    const presentation = targetPresentation(record.target)
    const practiceSets = records.reduce((sum, episode) => sum + (episode.practiceSets ?? 0), 0)
    const practiceSamples = records.reduce((sum, episode) => sum + (episode.practiceSamples ?? 0), 0)
    const response = record.response ?? candidate?.response
    const practice = response
        ? { completedDrills: response.runCount, sampleCount: response.sampleCount, value: metricValue(response.value, record.proof.metric) }
        : practiceSets > 0 || record.proof.bestAcquisition !== undefined
            ? { completedDrills: practiceSets, sampleCount: practiceSamples, value: record.proof.bestAcquisition === undefined ? null : metricValue(record.proof.bestAcquisition, record.proof.metric) }
            : null
    return {
        id: targetKey(record.target),
        target: record.target,
        label,
        ...presentation,
        state,
        ...copy,
        stages,
        direction: directionFor(record.prescription),
        metric: record.proof.metric,
        action: actionFor(record),
        episodeCount: records.length,
        lastEvidenceDate: record.lastEvidenceDate,
        impact: record.prescription.impactMsPer1000 > 0
            ? `Estimated impact ${(record.prescription.impactMsPer1000 / 1_000).toFixed(1)}s per 1,000 characters`
            : null,
        impactMsPer1000: record.prescription.impactMsPer1000 > 0 ? record.prescription.impactMsPer1000 : null,
        trend: trendFor(stages, directionFor(record.prescription), record.proof.metric),
        trendSource: stages.length > 1 ? "ability" : null,
        practice,
        episodes: [...records]
            .sort((a, b) => b.lastEvidenceDate.localeCompare(a.lastEvidenceDate) || b.id.localeCompare(a.id))
            .map((episode) => ({
                id: episode.id,
                date: episode.lastEvidenceDate,
                statusLabel: statusCopy(episode.state, targetDisplayLabel(episode.target), episode).statusLabel,
                stages: stagesFor(episode.proof),
            })),
    }
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

function candidateSeenWords(candidate: SkillCandidate): readonly string[] | undefined {
    if (candidate.reason.code === "gram_internal_latency_high") return candidate.reason.carrierWords
    if (candidate.reason.code === "word_internal_latency_high") return candidate.reason.words
    return undefined
}

function candidateTarget(candidate: SkillCandidate): ProgressCoachTarget {
    const label = targetDisplayLabel(candidate.target)
    const action = targetAction(candidate.target, "acquisition", { length: 30, seenWords: candidateSeenWords(candidate) })
    const presentation = targetPresentation(candidate.target)
    return {
        id: targetKey(candidate.target),
        target: candidate.target,
        label,
        ...presentation,
        state: "needs-work",
        statusLabel: "Needs work",
        headline: `Work on ${label}`,
        detail: candidateDetail(candidate.reason),
        stages: [{
            key: "recent", label: "Recent", value: metricValue(candidate.observed, candidate.metric), numericValue: candidate.observed, sampleCount: candidate.sampleCount,
        }],
        direction: candidate.direction,
        metric: candidate.metric,
        action: { href: action.href, label: action.label },
        episodeCount: 0,
        lastEvidenceDate: null,
        impact: candidate.impactMsPer1000 > 0
            ? `Estimated impact ${(candidate.impactMsPer1000 / 1_000).toFixed(1)}s per 1,000 characters`
            : null,
        impactMsPer1000: candidate.impactMsPer1000 > 0 ? candidate.impactMsPer1000 : null,
        trend: candidate.response
            ? trendBetween(candidate.observed, candidate.response.value, candidate.direction, candidate.metric)
            : null,
        trendSource: candidate.response ? "practice" : null,
        practice: candidate.response ? {
            completedDrills: candidate.response.runCount,
            sampleCount: candidate.response.sampleCount,
            value: metricValue(candidate.response.value, candidate.metric),
        } : null,
        episodes: [],
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
        impact: null,
        impactMsPer1000: null,
        trend: null,
        trendSource: null,
        practice: null,
        episodes: [],
    }
}

/** Pure Progress view-model: merges detected weaknesses and coached proof by Target identity. */
export function projectProgressCoach(
    analysis: SkillAnalysis,
    _session: DailyCoachingSession | null,
): ProgressCoachProjection {
    const episodes = new Map<string, MasteryRecord[]>()
    for (const record of analysis.mastery) {
        const key = targetKey(record.target)
        episodes.set(key, [...(episodes.get(key) ?? []), record])
    }
    const masteryTargets = [...episodes.values()].map((records) => rowFromRecord(
        [...records].sort((a, b) => b.lastEvidenceDate.localeCompare(a.lastEvidenceDate) || b.id.localeCompare(a.id))[0]!,
        records,
        analysis.candidates.find((candidate) => sameCoachingTarget(candidate.target, records[0]!.target)) ?? null,
    ))
    const masteryIds = new Set(masteryTargets.map((row) => row.id))
    const availableCandidates = analysis.candidates
        .filter((candidate) => !masteryIds.has(targetKey(candidate.target)))
    // Coached proof is durable evidence, so current weakness volume must never
    // crowd it out of the bounded list. This also keeps a just-completed Target
    // available to the latest-result card.
    const currentWeaknessCapacity = Math.min(
        CURRENT_WEAKNESS_LIMIT,
        Math.max(0, TARGET_LIMIT - Math.min(TARGET_LIMIT, masteryTargets.length)),
    )
    const selectedCandidates = selectCurrentWeaknesses(availableCandidates, currentWeaknessCapacity)
    const detectedTargets = selectedCandidates
        .map(candidateTarget)
    const statePriority: Record<ProgressCoachState, number> = {
        due: 0,
        regressed: 1,
        "needs-work": 2,
        training: 3,
        transferred: 4,
        retained: 5,
        calibrating: 6,
    }
    const targets = [...masteryTargets, ...detectedTargets]
        .sort((a, b) => (b.impactMsPer1000 ?? -1) - (a.impactMsPer1000 ?? -1)
            || statePriority[a.state] - statePriority[b.state]
            || (b.lastEvidenceDate ?? "").localeCompare(a.lastEvidenceDate ?? "")
            || a.label.localeCompare(b.label))
        .slice(0, TARGET_LIMIT)

    // The default detail follows the same Impact ordering as the ledger. There
    // is no separate prescribed Target; selecting any row is equally valid.
    const defaultTarget = targets[0] ?? calibrationTarget()
    return {
        defaultTarget,
        targets,
        targetLimit: TARGET_LIMIT,
    }
}

export function filterProgressCoachTargets(
    targets: readonly ProgressCoachTarget[],
    filter: ProgressCoachFilter,
): ProgressCoachTarget[] {
    return filter === "all" ? [...targets] : targets.filter((row) => row.filter === filter)
}
