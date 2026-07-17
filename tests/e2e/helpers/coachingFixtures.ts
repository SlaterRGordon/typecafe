import type { CoachingTarget } from "../../../src/lib/coachingTarget"
import { localDateKey, type DailyCoachingSession, type FrozenRecommendation } from "../../../src/lib/dailyCoaching"

const DAY_MS = 24 * 60 * 60 * 1000

function dateKey(daysAgo: number): string {
  return localDateKey(new Date(Date.now() - daysAgo * DAY_MS))
}

function prescription(id: string, target: CoachingTarget, baseline: number): FrozenRecommendation {
  return {
    id, target, metric: "ms", direction: "lower", baseline, weaknessThreshold: baseline - 80,
    minimumChange: 20, impactMsPer1000: id.includes("tion") ? 2900 : 1400,
    confidence: 0.9, sampleCount: 20, distinctTests: 3, distinctWords: 5,
    reasonCode: target.kind === "gram" ? "gram_internal_latency_high" : "transition_latency_above_baseline",
    reason: "Measured in recent natural typing.", seenWords: target.kind === "gram" ? ["station", "action"] : [],
  }
}

function transferredSession(id: string, daysAgo: number, target: CoachingTarget, label: string, baseline: number, transfer: number): DailyCoachingSession {
  const frozen = prescription(id, target, baseline)
  const date = dateKey(daysAgo)
  return {
    version: 3, id: `${date}:${id}`, dateKey: date, pool: "qwerty", language: "english",
    kind: "targeted", reason: frozen.reason, estimatedMinutes: 6, status: "completed", currentStepIndex: 1,
    steps: [
      {
        id: `${id}:focus`, kind: "focus", context: "acquisition", title: `Acquire ${label}`, detail: "", href: "/drill", target,
        sets: [
          { completedAt: Date.now() - daysAgo * DAY_MS, netWpm: 60, accuracy: 97, targetSamples: 8, targetDelta: { label, before: baseline, after: transfer - 20, unit: "ms", improved: true } },
          { completedAt: Date.now() - daysAgo * DAY_MS + 500, netWpm: 61, accuracy: 97, targetSamples: 8, targetDelta: { label, before: baseline, after: transfer - 15, unit: "ms", improved: true } },
        ],
      },
      {
        id: `${id}:transfer`, kind: "transfer", context: "transfer", title: `Transfer ${label}`, detail: "", href: "/drill", target, requiresTargetSample: true,
        sets: [{ completedAt: Date.now() - daysAgo * DAY_MS + 1000, netWpm: 62, accuracy: 98, targetSamples: 8, targetDelta: { label, before: baseline, after: transfer, unit: "ms", improved: true } }],
      },
    ],
    prescription: frozen, createdAt: Date.now() - daysAgo * DAY_MS, updatedAt: Date.now() - daysAgo * DAY_MS + 1000,
  }
}

function heldColdSession(daysAgo: number, target: CoachingTarget, label: string, baseline: number, cold: number): DailyCoachingSession {
  const date = dateKey(daysAgo)
  return {
    version: 3, id: `${date}:cold:${label}`, dateKey: date, pool: "qwerty", language: "english",
    kind: "targeted", reason: "Delayed Cold proof.", estimatedMinutes: 2, status: "completed", currentStepIndex: 0,
    steps: [{
      id: `${date}:recheck`, kind: "recheck", context: "cold", title: `Cold check ${label}`, detail: "", href: "/drill", target, requiresTargetSample: true,
      sets: [{ completedAt: Date.now() - daysAgo * DAY_MS, netWpm: 63, accuracy: 98, targetSamples: 7, targetDelta: { label, before: baseline, after: cold, unit: "ms", improved: true } }],
    }],
    yesterday: { label, target, unit: "ms", before: baseline, after: cold, minimumChange: 20 },
    createdAt: Date.now() - daysAgo * DAY_MS, updatedAt: Date.now() - daysAgo * DAY_MS,
  }
}

export function progressCoachingHistory(): DailyCoachingSession[] {
  const tion: CoachingTarget = { kind: "gram", gram: "tion" }
  const er: CoachingTarget = { kind: "transition", pair: "er", metric: "latency" }
  return [
    transferredSession("tion", 1, tion, "tion", 520, 455),
    heldColdSession(3, er, "e→r", 340, 290),
    transferredSession("er", 4, er, "e→r", 340, 300),
    transferredSession("er-old", 8, er, "e→r", 360, 330),
  ]
}

export function completedKeyAccuracySession(): DailyCoachingSession {
  const target: CoachingTarget = { kind: "key", keys: ["r"], metric: "accuracy" }
  const date = localDateKey()
  const now = Date.now()
  const frozen: FrozenRecommendation = {
    id: "key:accuracy:r", target, metric: "%", direction: "higher", baseline: 88,
    weaknessThreshold: 95, minimumChange: 4, impactMsPer1000: 900,
    confidence: 0.8, sampleCount: 40, distinctTests: 2, distinctWords: 8,
    reasonCode: "key_accuracy_below_threshold", reason: "Your r key was 88% accurate in recent natural typing.", seenWords: [],
  }
  return {
    version: 3, id: `${date}:key-accuracy-r`, dateKey: date, pool: "qwerty", language: "english",
    kind: "targeted", reason: frozen.reason, estimatedMinutes: 6, status: "completed", currentStepIndex: 2,
    steps: [
      {
        id: "r:baseline", kind: "baseline", context: "natural", title: "Warm measure", detail: "", href: "/",
        sets: [{ completedAt: now - 2_000, netWpm: 64, accuracy: 96 }],
      },
      {
        id: "r:focus", kind: "focus", context: "acquisition", title: "Acquire r", detail: "", href: "/drill", target,
        sets: [
          { completedAt: now - 1_500, netWpm: 65, accuracy: 97, targetSamples: 10, targetDelta: { label: "r", before: 88, after: 94, unit: "%", direction: "higher", improved: true } },
          { completedAt: now - 1_000, netWpm: 66, accuracy: 98, targetSamples: 10, targetDelta: { label: "r", before: 88, after: 95, unit: "%", direction: "higher", improved: true } },
        ],
      },
      {
        id: "r:transfer", kind: "transfer", context: "transfer", title: "Transfer r", detail: "", href: "/drill", target, requiresTargetSample: true,
        sets: [{ completedAt: now - 500, netWpm: 67, accuracy: 98, targetSamples: 8, targetDelta: { label: "r", before: 88, after: 96, unit: "%", direction: "higher", improved: true } }],
      },
    ],
    prescription: frozen, createdAt: now - 3_000, updatedAt: now - 500,
  }
}
