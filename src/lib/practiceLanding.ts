import type { CustomGramsPracticePreferences } from "./customGramsPractice"
import { summarizeCustomGramsPracticePreferences } from "./customGramsPreferences"
import type { CustomKeysPracticePreferences } from "./customKeysPractice"
import { summarizeCustomKeysPracticePreferences } from "./customKeysPreferences"
import type { ProgressCoachProjection, ProgressCoachTarget } from "./progressCoach"

export interface PracticeLandingAction {
    href: string
    label: string
}

export interface PracticeLandingRecommendation {
    id: string
    label: string
    typeLabel: string
    reason: string
    statusLabel: string
    recentMeasurement: string | null
    primaryAction: PracticeLandingAction
    secondaryAction: PracticeLandingAction | null
    awaitingMeasurement: boolean
}

export interface PracticeLandingCustomPath {
    kind: "keys" | "grams"
    title: "Keys" | "Grams"
    href: string
    focus: string
    settings: string
}

export interface PracticeLandingProjection {
    recommendation: PracticeLandingRecommendation | null
    emptyAction: PracticeLandingAction
    customPaths: [PracticeLandingCustomPath, PracticeLandingCustomPath]
}

const TAKE_A_TEST = { href: "/?mode=timed&count=60", label: "Take a Test" }

function guidedAction(target: ProgressCoachTarget): PracticeLandingAction | null {
    const actions = [target.action, target.secondaryAction]
    return actions.find((action): action is PracticeLandingAction => action?.href.startsWith("/practice?") === true) ?? null
}

/**
 * Action-first Practice presentation over Progress's already-ranked projection.
 * This policy never reads candidates or chooses a Target: defaultTarget is the
 * one decision shared by both destinations.
 */
export function projectPracticeLanding(input: {
    progress: ProgressCoachProjection
    keys: CustomKeysPracticePreferences
    grams: CustomGramsPracticePreferences
}): PracticeLandingProjection {
    const target = input.progress.defaultTarget
    const practice = target.target ? guidedAction(target) : null
    const recommendation = target.target && practice ? {
        id: target.id,
        label: target.label,
        typeLabel: target.typeLabel,
        reason: target.detail,
        statusLabel: target.awaitingMeasurement ? "practised · awaiting Test" : target.statusLabel,
        recentMeasurement: target.stages.at(-1)?.value ?? null,
        primaryAction: target.awaitingMeasurement && target.action ? target.action : practice,
        secondaryAction: target.awaitingMeasurement ? practice : null,
        awaitingMeasurement: target.awaitingMeasurement,
    } satisfies PracticeLandingRecommendation : null
    const keys = summarizeCustomKeysPracticePreferences(input.keys)
    const grams = summarizeCustomGramsPracticePreferences(input.grams)

    return {
        recommendation,
        emptyAction: { ...TAKE_A_TEST },
        customPaths: [
            { kind: "keys", title: "Keys", href: "/practice?custom=keys", ...keys },
            { kind: "grams", title: "Grams", href: "/practice?custom=grams", ...grams },
        ],
    }
}
