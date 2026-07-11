// Guided-player session state (Phase 4 §4.4). Pure + unit-testable. The plan
// itself (the ordered days/steps) is derived from weakness data on each load;
// this is only the player's *position* in it - which day, which step, and
// whether the day or whole plan is done. Persisted to localStorage so a returning
// visitor resumes where they left off (synced on sign-in later).

import type { Plan } from "./plan"

export type PlanStatus = "active" | "day-done" | "plan-done"

export interface PlanSessionState {
    day: number // 1-based
    stepIndex: number // 0-based within the day's steps
    status: PlanStatus
}

export const PLAN_SESSION_KEY = "typecafe:planSession"

export function initialSession(): PlanSessionState {
    return { day: 1, stepIndex: 0, status: "active" }
}

// Keep a stored session valid against the current plan, which can regenerate as
// weakness data loads (calibration → targeted, different lengths). Clamps the day
// and step into range and drops an impossible "done" status.
export function reconcile(state: PlanSessionState, plan: Plan): PlanSessionState {
    if (plan.days.length === 0) return initialSession()
    const day = Math.min(Math.max(1, Math.floor(state.day || 1)), plan.days.length)
    const steps = plan.days[day - 1]!.steps.length
    const stepIndex = Math.min(Math.max(0, Math.floor(state.stepIndex || 0)), Math.max(0, steps - 1))
    const status: PlanStatus = state.status === "day-done" || state.status === "plan-done" ? state.status : "active"
    // A day-done on a day that still has later steps shouldn't happen, but if the
    // plan grew, treat it as active again.
    if (status === "day-done" && stepIndex < steps - 1) return { day, stepIndex, status: "active" }
    return { day, stepIndex, status }
}

// Finish the active step. Advances within the day; when the last step is done the
// day is complete (call nextDay to move on). No-op once the day/plan is done.
export function completeStep(state: PlanSessionState, plan: Plan): PlanSessionState {
    if (state.status !== "active") return state
    const day = plan.days[state.day - 1]
    if (!day) return state
    const next = state.stepIndex + 1
    if (next < day.steps.length) return { ...state, stepIndex: next }
    return { ...state, status: "day-done" }
}

// Move to the next day, or finish the plan after the last day.
export function nextDay(state: PlanSessionState, plan: Plan): PlanSessionState {
    if (state.day >= plan.days.length) return { ...state, status: "plan-done" }
    return { day: state.day + 1, stepIndex: 0, status: "active" }
}

export function parseSession(raw: string | null): PlanSessionState | null {
    if (!raw) return null
    try {
        const v = JSON.parse(raw) as Partial<PlanSessionState>
        if (
            typeof v.day === "number" &&
            typeof v.stepIndex === "number" &&
            (v.status === "active" || v.status === "day-done" || v.status === "plan-done")
        ) {
            return { day: v.day, stepIndex: v.stepIndex, status: v.status }
        }
    } catch { /* corrupt - ignore */ }
    return null
}
