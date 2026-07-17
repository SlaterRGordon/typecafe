import { currentDailyStep, type DailyCoachingSession, type FrozenRecommendation } from "./dailyCoaching"
import { sameCoachingTarget, targetAction, targetDisplayLabel, type CoachingTarget } from "./coachingTarget"
import type { MasteryRecord, SkillAnalysis, SkillCandidate, SkillReason, TargetProof } from "./skillEvidence"

export type ProgressCoachState = MasteryRecord["state"] | "needs-work" | "calibrating"
export type ProgressCoachFilter = "all" | "needs-action" | "held"
type ProgressCoachCategory = Exclude<ProgressCoachFilter, "all"> | "other"

export interface ProgressCoachStage {
    key: "baseline" | "practice" | "transfer" | "cold" | "recent"
    label: "Baseline" | "Practice" | "Transfer" | "Cold" | "Recent"
    value: string
    sampleCount: number
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
    state: ProgressCoachState
    statusLabel: string
    headline: string
    detail: string
    stages: ProgressCoachStage[]
    direction: "lower" | "higher" | null
    metric: "ms" | "%" | "wpm" | null
    action: { href: string, label: string } | null
    episodeCount: number
    isNextAction: boolean
    filter: ProgressCoachCategory
    lastEvidenceDate: string | null
    impact: string | null
    episodes: ProgressCoachEpisode[]
}

export interface ProgressCoachProjection {
    nextAction: ProgressCoachTarget
    targets: ProgressCoachTarget[]
    targetLimit: number
}

const TARGET_LIMIT = 30

function targetKey(target: CoachingTarget): string {
    return JSON.stringify(target)
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
        sampleCount: proof.sampleCounts.baseline,
    }]
    if (proof.bestAcquisition !== undefined) stages.push({
        key: "practice", label: "Practice", value: metricValue(proof.bestAcquisition, proof.metric), sampleCount: 0,
    })
    if (proof.transfer !== undefined) stages.push({
        key: "transfer", label: "Transfer", value: metricValue(proof.transfer, proof.metric), sampleCount: proof.sampleCounts.transfer,
    })
    if (proof.cold !== undefined) stages.push({
        key: "cold", label: "Cold", value: metricValue(proof.cold, proof.metric), sampleCount: proof.sampleCounts.cold,
    })
    return stages
}

function directionFor(prescription: FrozenRecommendation): "lower" | "higher" {
    return prescription.direction
}

function statusCopy(state: MasteryRecord["state"], label: string, record: MasteryRecord): Pick<ProgressCoachTarget, "statusLabel" | "headline" | "detail" | "filter"> {
    if (state === "due") return {
        statusLabel: "Check due",
        headline: `See whether your ${label} gain held`,
        detail: "A delayed Cold check is due. Do it before warm practice so the result can advance Mastery.",
        filter: "needs-action",
    }
    if (state === "regressed") return {
        statusLabel: "Needs a refresh",
        headline: `Refresh ${label}`,
        detail: "Recent natural evidence crossed the frozen weakness threshold again. Rebuild the Target, then prove Transfer in varied text.",
        filter: "needs-action",
    }
    if (state === "retained") return {
        statusLabel: "Held",
        headline: `Your ${label} gain held`,
        detail: `${record.heldColdChecks} delayed Cold ${record.heldColdChecks === 1 ? "check has" : "checks have"} held. No extra Drill is prescribed right now.${record.practicedDaysUntilDue ? ` Next check in ${record.practicedDaysUntilDue} practiced ${record.practicedDaysUntilDue === 1 ? "day" : "days"}.` : ""}`,
        filter: "held",
    }
    if (state === "transferred") return {
        statusLabel: "Transferred",
        headline: `${label} improved in varied text`,
        detail: "The gain transferred beyond focused practice. Its Cold check becomes eligible on the next practiced day.",
        filter: "other",
    }
    return {
        statusLabel: "In training",
        headline: `Keep building ${label}`,
        detail: "Focused practice has started, but varied Transfer evidence has not cleared the frozen threshold yet.",
        filter: "needs-action",
    }
}

function actionFor(record: MasteryRecord, isCurrentTarget: boolean): ProgressCoachTarget["action"] {
    if (record.state === "due") return { href: "/plan", label: "Start Cold check" }
    if (record.state === "regressed") return isCurrentTarget
        ? { href: "/plan", label: "Refresh in today’s plan" }
        : { href: targetAction(record.target, "acquisition", { length: 30, seenWords: record.prescription.seenWords }).href, label: "Refresh Target" }
    if (record.state === "training") return {
        href: "/plan",
        label: isCurrentTarget ? "Continue today’s plan" : "Continue with Coach",
    }
    return null
}

function rowFromRecord(record: MasteryRecord, records: readonly MasteryRecord[], currentTarget: CoachingTarget | null, candidate: SkillCandidate | null): ProgressCoachTarget {
    const label = targetDisplayLabel(record.target)
    const copy = statusCopy(record.state, label, record)
    const isCurrentTarget = !!currentTarget && sameCoachingTarget(record.target, currentTarget)
    const stages = stagesFor(record.proof)
    if (record.state === "regressed" && record.proof.cold === undefined && candidate?.metric === record.proof.metric) {
        stages.push({ key: "recent", label: "Recent", value: metricValue(candidate.observed, candidate.metric), sampleCount: candidate.sampleCount })
    }
    return {
        id: targetKey(record.target),
        target: record.target,
        label,
        state: record.state,
        ...copy,
        stages,
        direction: directionFor(record.prescription),
        metric: record.proof.metric,
        action: actionFor(record, isCurrentTarget),
        episodeCount: records.length,
        isNextAction: false,
        lastEvidenceDate: record.lastEvidenceDate,
        impact: record.prescription.impactMsPer1000 > 0
            ? `Estimated impact ${(record.prescription.impactMsPer1000 / 1_000).toFixed(1)}s per 1,000 characters`
            : null,
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
    return {
        id: targetKey(candidate.target),
        target: candidate.target,
        label,
        state: "needs-work",
        statusLabel: "Needs work",
        headline: `Work on ${label}`,
        detail: candidateDetail(candidate.reason),
        stages: [{
            key: "recent", label: "Recent", value: metricValue(candidate.observed, candidate.metric), sampleCount: candidate.sampleCount,
        }],
        direction: candidate.direction,
        metric: candidate.metric,
        action: { href: action.href, label: action.label },
        episodeCount: 0,
        isNextAction: false,
        filter: "needs-action",
        lastEvidenceDate: null,
        impact: candidate.impactMsPer1000 > 0
            ? `Estimated impact ${(candidate.impactMsPer1000 / 1_000).toFixed(1)}s per 1,000 characters`
            : null,
        episodes: [],
    }
}

function nextActionFrom(row: ProgressCoachTarget): ProgressCoachTarget {
    return {
        ...row,
        statusLabel: row.state === "needs-work" ? "Next Target" : row.statusLabel,
        headline: row.state === "needs-work" ? `Work on ${row.label} next` : row.headline,
        detail: row.state === "needs-work"
            ? `${row.detail} It is the highest-Impact supported Target; the estimate is not a promise of WPM gained.`
            : row.detail,
        action: {
            href: "/plan",
            label: row.state === "due" ? "Start Cold check" : "Open today’s plan",
        },
        isNextAction: true,
    }
}

function calibrationTarget(): ProgressCoachTarget {
    return {
        id: "calibration",
        target: null,
        label: "Calibration",
        state: "calibrating",
        statusLabel: "Building evidence",
        headline: "Map your typing to find a stable Target",
        detail: "One longer Test gives the coach enough repeated natural evidence to rank a useful Target.",
        stages: [],
        direction: null,
        metric: null,
        action: { href: "/plan", label: "Start mapping Test" },
        episodeCount: 0,
        isNextAction: true,
        filter: "needs-action",
        lastEvidenceDate: null,
        impact: null,
        episodes: [],
    }
}

function currentTarget(session: DailyCoachingSession | null): CoachingTarget | null {
    if (!session || session.status === "completed") return null
    return currentDailyStep(session)?.target ?? session.prescription?.target ?? null
}

/** Pure Progress view-model: merges detected weaknesses and coached proof by Target identity. */
export function projectProgressCoach(
    analysis: SkillAnalysis,
    session: DailyCoachingSession | null,
): ProgressCoachProjection {
    const activeTarget = currentTarget(session)
    const episodes = new Map<string, MasteryRecord[]>()
    for (const record of analysis.mastery) {
        const key = targetKey(record.target)
        episodes.set(key, [...(episodes.get(key) ?? []), record])
    }
    const masteryTargets = [...episodes.values()].map((records) => rowFromRecord(
        [...records].sort((a, b) => b.lastEvidenceDate.localeCompare(a.lastEvidenceDate) || b.id.localeCompare(a.id))[0]!,
        records,
        activeTarget,
        analysis.candidates.find((candidate) => sameCoachingTarget(candidate.target, records[0]!.target)) ?? null,
    ))
    const masteryIds = new Set(masteryTargets.map((row) => row.id))
    const detectedTargets = analysis.candidates
        .filter((candidate) => !masteryIds.has(targetKey(candidate.target)))
        .map(candidateTarget)
    const impactById = new Map(analysis.candidates.map((candidate) => [targetKey(candidate.target), candidate.impactMsPer1000]))
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
        .sort((a, b) => statePriority[a.state] - statePriority[b.state]
            || (impactById.get(b.id) ?? 0) - (impactById.get(a.id) ?? 0)
            || (b.lastEvidenceDate ?? "").localeCompare(a.lastEvidenceDate ?? "")
            || a.label.localeCompare(b.label))
        .slice(0, TARGET_LIMIT)

    const activeRow = activeTarget ? targets.find((row) => row.target && sameCoachingTarget(row.target, activeTarget)) : null
    const priorityRow = activeRow
        ?? (analysis.recap.due ? targets.find((row) => row.target && sameCoachingTarget(row.target, analysis.recap.due!.target)) : null)
        ?? (analysis.recap.regressed ? targets.find((row) => row.target && sameCoachingTarget(row.target, analysis.recap.regressed!.target)) : null)
        ?? (analysis.recommendation ? targets.find((row) => row.target && sameCoachingTarget(row.target, analysis.recommendation!.target)) : null)
    const latestResult = [...targets]
        .filter((row) => row.state === "transferred" || row.state === "retained")
        .sort((a, b) => (b.lastEvidenceDate ?? "").localeCompare(a.lastEvidenceDate ?? "") || a.label.localeCompare(b.label))[0]
        ?? targets.find((row) => row.state === "training")
    const nextAction = priorityRow
        ? nextActionFrom(priorityRow)
        : latestResult
            ? { ...latestResult, isNextAction: true }
            : calibrationTarget()
    return {
        nextAction,
        targets: targets.map((row) => ({ ...row, isNextAction: !!nextAction.action && row.id === nextAction.id })),
        targetLimit: TARGET_LIMIT,
    }
}

export function filterProgressCoachTargets(
    targets: readonly ProgressCoachTarget[],
    filter: ProgressCoachFilter,
): ProgressCoachTarget[] {
    return filter === "all" ? [...targets] : targets.filter((row) => row.filter === filter)
}
