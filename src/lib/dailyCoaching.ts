// The daily coaching session (docs/features/daily-coaching.md). One dated
// prescription per language/stats pool: warm-up Test, then repeated sets on the
// best target - plus a worst-two-keys pass when the main target is a
// transition. Proof is the target metric (and tomorrow's cold check), never a
// same-day global-WPM delta - two warm 30s samples prove warm-up, not
// improvement. Pure and unit-testable; storage helpers at the bottom.

import { nextDrillFinding, type DrillDelta, type KeyAttempts } from "./drillProgress"
import { composeWeakKeys, worstKeysFromAttempts } from "./stats"
import type { TransitionAggregate } from "./transitions"

export const DAILY_COACHING_STORAGE_KEY = "typecafe:dailyCoaching"
export const DAILY_COACHING_UPDATED_EVENT = "typecafe:daily-coaching-updated"
// Storage is scoped per account (or "guest") so a shared browser can never
// leak one account's session into another - see writeLocalDailySession.
export const GUEST_DAILY_SCOPE = "guest"

export type DailySessionKind = "calibration" | "targeted"
export type DailySessionStatus = "active" | "completed"
// baseline/calibration complete on the real Test surface (adopted from any
// qualifying completion); recheck/focus complete on /drill.
export type DailyStepKind = "baseline" | "calibration" | "recheck" | "focus"

export type DrillTarget =
    | { kind: "transition", pair: string }
    | { kind: "keys", keys: string[] }

// One completed rep. targetDelta is present when the rep had enough samples on
// the target to measure honestly (drillProgress thresholds).
export interface DailySet {
    completedAt: number
    netWpm: number
    accuracy: number
    targetDelta?: DrillDelta
}

export interface DailyStep {
    id: string
    kind: DailyStepKind
    title: string
    detail: string
    href: string
    target?: DrillTarget
    sets: DailySet[]
}

// Yesterday's focus outcome, frozen into today's session at creation so the
// cold check can compare against it without re-reading old snapshots.
export interface YesterdayOutcome {
    label: string
    target: DrillTarget
    unit: "ms" | "%"
    before: number
    after: number
}

export interface DailyCoachingSession {
    version: 2
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
    yesterday?: YesterdayOutcome | null
    now?: number
}

// A focus step ends when the user beats their baseline twice, or after three
// sets - whichever comes first. Enough reps to plausibly move a motor pattern,
// bounded so a bad day still ends.
export const FOCUS_SETS_GOAL = 3
export const FOCUS_IMPROVED_GOAL = 2

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_STEPS = 4
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
    return [context.dateKey, context.pool, context.language]
        .map((part) => encodeURIComponent(part))
        .join(":")
}

export function targetLabel(target: DrillTarget): string {
    if (target.kind === "transition") return `${target.pair[0]}→${target.pair[1]}`
    return target.keys.join(" ")
}

export function targetHref(target: DrillTarget): string {
    if (target.kind === "transition") return `/drill?transitions=${target.pair}&length=30`
    return `/drill?keys=${target.keys.join(",")}&length=30`
}

function sameTarget(a: DrillTarget | undefined, b: DrillTarget | undefined): boolean {
    if (!a || !b) return false
    if (a.kind === "transition") return b.kind === "transition" && a.pair === b.pair
    return b.kind === "keys" && a.keys.length === b.keys.length && a.keys.every((key, i) => b.keys[i] === key)
}

// Does the drill the user is actually running cover this step's target? The
// prescription counts drills by what they train, not by how they were launched.
export function targetMatchesDrill(target: DrillTarget, drill: { kind: "keys" | "transitions", targets: string[] }): boolean {
    if (target.kind === "transition") return drill.kind === "transitions" && drill.targets.includes(target.pair)
    return drill.kind === "keys" && target.keys.every((key) => drill.targets.includes(key))
}

// A normal-mode Test qualifies as the day's measure when it is long enough to
// be signal. Adopted from any completion - no special launch path required.
export function measureQualifies(kind: DailyStepKind, run: { subMode: "timed" | "words", count: number }): boolean {
    if (kind === "baseline") return run.subMode === "timed" ? run.count >= 30 : run.count >= 25
    if (kind === "calibration") return run.subMode === "timed" ? run.count >= 60 : run.count >= 50
    return false
}

function formatOutcome(outcome: YesterdayOutcome, value: number): string {
    return outcome.unit === "ms" ? `${Math.round(value)}ms` : `${value.toFixed(1)}%`
}

export function createDailySession(input: CreateDailySessionInput): DailyCoachingSession {
    const id = sessionId(input)
    const now = input.now ?? Date.now()
    const finding = nextDrillFinding(input.transitions, input.attempts)
    const yesterday = input.yesterday ?? undefined

    if (!finding) {
        return {
            version: 2,
            id,
            dateKey: input.dateKey,
            pool: input.pool,
            language: input.language,
            kind: "calibration",
            reason: "I’m still learning how you type. One longer Test gives me enough repeated keys and transitions to find a stable weakness - you’ll see your first finding the moment you finish.",
            estimatedMinutes: 2,
            status: "active",
            currentStepIndex: 0,
            steps: [{
                id: `${id}:calibration`,
                kind: "calibration",
                title: "Map your typing",
                detail: "One 60-second Test (or 50+ words). Any normal Test that long counts automatically.",
                href: "/?mode=timed&count=60",
                sets: [],
            }],
            createdAt: now,
            updatedAt: now,
        }
    }

    const target: DrillTarget = finding.kind === "transition"
        ? { kind: "transition", pair: finding.pair }
        : { kind: "keys", keys: finding.keys }
    const label = targetLabel(target)
    const continuing = yesterday && sameTarget(target, yesterday.target)

    const findingReason = finding.kind === "transition"
        ? `Your ${label} transition is ${finding.ratio.toFixed(1)}× slower than your typical transition.`
        : `Your weakest recent keys are ${label}.`
    const reason = continuing
        ? `Yesterday you took ${yesterday.label} from ${formatOutcome(yesterday, yesterday.before)} to ${formatOutcome(yesterday, yesterday.after)}. It’s still your best lever - today’s first set is the cold check: did it stick?`
        : `${findingReason} Today: a short warm-up Test, then repeat sets on it until you beat your baseline twice.`

    const steps: DailyStep[] = [{
        id: `${id}:baseline`,
        kind: "baseline",
        title: "Warm up: 30-second Test",
        detail: "Any normal Test of 30+ seconds (or 25+ words) counts automatically - no special mode.",
        href: "/?mode=timed&count=30",
        sets: [],
    }]

    // Yesterday's target moved on? Still check it cold - retention is the proof.
    if (yesterday && !continuing) {
        steps.push({
            id: `${id}:recheck`,
            kind: "recheck",
            title: `Cold check ${yesterday.label}`,
            detail: "One set on yesterday's target before any practice on it - did the change stick?",
            href: targetHref(yesterday.target),
            target: yesterday.target,
            sets: [],
        })
    }

    steps.push({
        id: `${id}:focus`,
        kind: "focus",
        title: finding.kind === "transition" ? `Loosen ${label}` : `Clean up ${label}`,
        detail: "Repeat sets - beat your baseline twice, or stop after three sets.",
        href: targetHref(target),
        target,
        sets: [],
    })

    // The day's second lever: the worst two keys, after the transition work.
    // Only when the main target is a transition (a keys finding already is key
    // work) - the transition trains flow, the keys train accuracy.
    const weakKeys = finding.kind === "transition"
        ? composeWeakKeys(worstKeysFromAttempts(input.attempts, Infinity)).slice(0, 2).map((entry) => entry.key)
        : []
    if (weakKeys.length > 0) {
        const keysTarget: DrillTarget = { kind: "keys", keys: weakKeys }
        steps.push({
            id: `${id}:keys`,
            kind: "focus",
            title: `Clean up ${targetLabel(keysTarget)}`,
            detail: "Your weakest recent keys. Repeat sets - beat your baseline twice, or stop after three sets.",
            href: targetHref(keysTarget),
            target: keysTarget,
            sets: [],
        })
    }

    return {
        version: 2,
        id,
        dateKey: input.dateKey,
        pool: input.pool,
        language: input.language,
        kind: "targeted",
        reason,
        // Roughly: warm-up ~1.5 min, each drill step ~1-2 min of short sets.
        estimatedMinutes: 2 + steps.length,
        status: "active",
        currentStepIndex: 0,
        steps,
        ...(yesterday ? { yesterday } : {}),
        createdAt: now,
        updatedAt: now,
    }
}

export function currentDailyStep(session: DailyCoachingSession): DailyStep | null {
    if (session.status === "completed") return null
    return session.steps[session.currentStepIndex] ?? null
}

export function stepGoalMet(step: DailyStep): boolean {
    if (step.kind !== "focus") return step.sets.length >= 1
    const improved = step.sets.filter((set) => set.targetDelta?.improved).length
    return improved >= FOCUS_IMPROVED_GOAL || step.sets.length >= FOCUS_SETS_GOAL
}

export function completedSetCount(session: DailyCoachingSession): number {
    return session.steps.reduce((sum, step) => sum + step.sets.length, 0)
}

// Append one verified rep to the active step; advance when its goal is met.
// Only the active step records - a no-op for anything else.
export function recordDailySet(
    session: DailyCoachingSession,
    stepId: string,
    set: Omit<DailySet, "completedAt"> & { completedAt?: number },
): DailyCoachingSession {
    if (session.status !== "active") return session
    const active = currentDailyStep(session)
    if (!active || active.id !== stepId) return session
    if (!Number.isFinite(set.netWpm) || !Number.isFinite(set.accuracy)) return session
    if (active.sets.length >= MAX_SETS) return session

    const completedAt = set.completedAt ?? Date.now()
    const steps = session.steps.map((step) => step.id === stepId
        ? { ...step, sets: [...step.sets, { ...set, completedAt }] }
        : step)
    const stepDone = stepGoalMet(steps[session.currentStepIndex]!)
    const nextIndex = stepDone ? session.currentStepIndex + 1 : session.currentStepIndex
    const done = nextIndex >= steps.length
    return {
        ...session,
        steps,
        status: done ? "completed" : "active",
        currentStepIndex: done ? steps.length - 1 : nextIndex,
        updatedAt: completedAt,
    }
}

export function focusStep(session: DailyCoachingSession): DailyStep | null {
    return session.steps.find((step) => step.kind === "focus") ?? null
}

export function baselineResult(session: DailyCoachingSession): DailySet | null {
    const step = session.steps.find((s) => s.kind === "baseline" || s.kind === "calibration")
    return step?.sets[0] ?? null
}

// The day's honest target result: the best measured set against the lifetime
// baseline captured when it ran. Null when no set had enough target reps -
// never claim a win that isn't there.
export function focusProof(session: DailyCoachingSession): DrillDelta | null {
    const step = focusStep(session)
    if (!step) return null
    const deltas = step.sets.map((set) => set.targetDelta).filter((d): d is DrillDelta => !!d)
    if (deltas.length === 0) return null
    return deltas.reduce((best, next) => {
        if (best.unit !== next.unit) return best
        return best.unit === "ms" ? (next.after < best.after ? next : best) : (next.after > best.after ? next : best)
    })
}

// Summarize a finished (or partial) session for tomorrow's cold check.
export function yesterdayOutcomeFrom(session: DailyCoachingSession | null): YesterdayOutcome | null {
    if (!session) return null
    const step = focusStep(session)
    const proof = session.status === "completed" || (step && stepGoalMet(step)) ? focusProof(session) : null
    if (!step?.target || !proof) return null
    return { label: proof.label, target: step.target, unit: proof.unit, before: proof.before, after: proof.after }
}

export interface ColdCheckResult {
    value: number
    unit: "ms" | "%"
    // Still better than where yesterday started - the improvement was retained.
    held: boolean
    yesterday: YesterdayOutcome
}

// Today's cold read on yesterday's target: the recheck set, or - when today
// continues the same target - the first focus set. Null until it's typed.
export function coldCheck(session: DailyCoachingSession): ColdCheckResult | null {
    const yesterday = session.yesterday
    if (!yesterday) return null
    const recheck = session.steps.find((step) => step.kind === "recheck")
    const focus = focusStep(session)
    const source = recheck ?? (focus && sameTarget(focus.target, yesterday.target) ? focus : null)
    const delta = source?.sets[0]?.targetDelta
    if (!delta || delta.unit !== yesterday.unit) return null
    const held = yesterday.unit === "ms" ? delta.after < yesterday.before : delta.after > yesterday.before
    return { value: delta.after, unit: yesterday.unit, held, yesterday }
}

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function shortString(value: unknown): value is string {
    return typeof value === "string" && value.length <= MAX_STRING
}

function parseTarget(value: unknown): DrillTarget | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (raw.kind === "transition" && typeof raw.pair === "string" && raw.pair.length === 2) {
        return { kind: "transition", pair: raw.pair }
    }
    if (
        raw.kind === "keys" && Array.isArray(raw.keys) && raw.keys.length > 0 && raw.keys.length <= 8 &&
        raw.keys.every((key): key is string => typeof key === "string" && key.length === 1)
    ) return { kind: "keys", keys: raw.keys }
    return null
}

function parseDelta(value: unknown): DrillDelta | undefined {
    if (!value || typeof value !== "object") return undefined
    const d = value as Record<string, unknown>
    if (
        shortString(d.label) && finiteNumber(d.before) && finiteNumber(d.after) &&
        (d.unit === "ms" || d.unit === "%") && typeof d.improved === "boolean"
    ) return { label: d.label, before: d.before, after: d.after, unit: d.unit, improved: d.improved }
    return undefined
}

function parseSet(value: unknown): DailySet | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (!finiteNumber(raw.completedAt) || !finiteNumber(raw.netWpm) || !finiteNumber(raw.accuracy)) return null
    const targetDelta = parseDelta(raw.targetDelta)
    if (raw.targetDelta !== undefined && !targetDelta) return null
    return { completedAt: raw.completedAt, netWpm: raw.netWpm, accuracy: raw.accuracy, ...(targetDelta ? { targetDelta } : {}) }
}

function parseYesterday(value: unknown): YesterdayOutcome | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    const target = parseTarget(raw.target)
    if (
        !target || !shortString(raw.label) || (raw.unit !== "ms" && raw.unit !== "%") ||
        !finiteNumber(raw.before) || !finiteNumber(raw.after)
    ) return null
    return { label: raw.label, target, unit: raw.unit, before: raw.before, after: raw.after }
}

export function parseDailySession(value: unknown): DailyCoachingSession | null {
    if (!value || typeof value !== "object") return null
    const raw = value as Record<string, unknown>
    if (
        raw.version !== 2 || !shortString(raw.id) || typeof raw.dateKey !== "string" || !DATE_KEY_RE.test(raw.dateKey) ||
        !shortString(raw.pool) || !shortString(raw.language) ||
        (raw.kind !== "calibration" && raw.kind !== "targeted") ||
        !shortString(raw.reason) || !finiteNumber(raw.estimatedMinutes) ||
        (raw.status !== "active" && raw.status !== "completed") ||
        !Number.isInteger(raw.currentStepIndex) || !finiteNumber(raw.createdAt) || !finiteNumber(raw.updatedAt) ||
        !Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > MAX_STEPS
    ) return null

    const yesterday = raw.yesterday === undefined ? undefined : parseYesterday(raw.yesterday)
    if (raw.yesterday !== undefined && !yesterday) return null

    const steps: DailyStep[] = []
    for (const item of raw.steps) {
        if (!item || typeof item !== "object") return null
        const step = item as Record<string, unknown>
        if (
            !shortString(step.id) ||
            (step.kind !== "baseline" && step.kind !== "calibration" && step.kind !== "recheck" && step.kind !== "focus") ||
            !shortString(step.title) || !shortString(step.detail) || !shortString(step.href) ||
            !Array.isArray(step.sets) || step.sets.length > MAX_SETS
        ) return null
        const target = step.target === undefined ? undefined : parseTarget(step.target)
        if (step.target !== undefined && !target) return null
        const sets: DailySet[] = []
        for (const rawSet of step.sets) {
            const set = parseSet(rawSet)
            if (!set) return null
            sets.push(set)
        }
        steps.push({
            id: step.id, kind: step.kind, title: step.title, detail: step.detail, href: step.href,
            ...(target ? { target } : {}), sets,
        })
    }

    const currentStepIndex = raw.currentStepIndex as number
    if (currentStepIndex < 0 || currentStepIndex >= steps.length) return null
    // Progress must be internally consistent: everything before the active step
    // met its goal, nothing after it has started, done sessions met every goal.
    if (raw.status === "completed") {
        if (!steps.every(stepGoalMet)) return null
    } else {
        if (!steps.slice(0, currentStepIndex).every(stepGoalMet)) return null
        if (stepGoalMet(steps[currentStepIndex]!)) return null
        if (!steps.slice(currentStepIndex + 1).every((step) => step.sets.length === 0)) return null
    }

    return {
        version: 2,
        id: raw.id,
        dateKey: raw.dateKey,
        pool: raw.pool,
        language: raw.language,
        kind: raw.kind,
        reason: raw.reason,
        estimatedMinutes: raw.estimatedMinutes,
        status: raw.status,
        currentStepIndex,
        steps,
        ...(yesterday ? { yesterday } : {}),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
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
        return values.map(parseDailySession).filter((value): value is DailyCoachingSession => value !== null)
    } catch {
        return []
    }
}

export function readLocalDailySession(scope: string, context: DailySessionContext, storage?: Storage): DailyCoachingSession | null {
    return readAll(scope, storage).find((session) =>
        session.dateKey === context.dateKey && session.pool === context.pool && session.language === context.language,
    ) ?? null
}

export function writeLocalDailySession(scope: string, session: DailyCoachingSession, storage?: Storage): void {
    const target = resolveStorage(storage)
    if (!target) return
    const sessions = readAll(scope, storage).filter((item) => item.id !== session.id)
    sessions.push(session)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    try {
        // Keep a few days per scope: today plus yesterday (for the cold check).
        target.setItem(storageKeyFor(scope), JSON.stringify(sessions.slice(0, 8)))
        if (!storage && typeof window !== "undefined") window.dispatchEvent(new Event(DAILY_COACHING_UPDATED_EVENT))
    } catch {
        // Storage can be blocked; the live session still works for this render.
    }
}

// Clears one scope's local mirror - the guest scope after its session has been
// adopted into a signed-in account (mirrors GuestImport's clear-after-sync).
export function clearLocalDailySessions(scope: string, storage?: Storage): void {
    const target = resolveStorage(storage)
    if (!target) return
    try { target.removeItem(storageKeyFor(scope)) } catch { /* blocked storage */ }
}

// Convergence rule shared by client and server: most completed work wins,
// updatedAt breaks ties. An offline/stale device can never rewind progress.
export function preferDailySession(
    local: DailyCoachingSession | null,
    remote: DailyCoachingSession | null,
): DailyCoachingSession | null {
    if (!local) return remote
    if (!remote) return local
    if (local.id !== remote.id) return local.updatedAt >= remote.updatedAt ? local : remote
    const localSets = completedSetCount(local)
    const remoteSets = completedSetCount(remote)
    if (localSets !== remoteSets) return localSets > remoteSets ? local : remote
    return local.updatedAt >= remote.updatedAt ? local : remote
}
