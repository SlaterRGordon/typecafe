import { EVIDENCE_CONTEXTS, type EvidenceContext } from "./evidenceContext"
import type { EncodedTimeline } from "./keystrokes"

export interface EvidenceTestConfiguration {
    mode: number
    subMode: number
    count: number
    options: string
    punctuation: boolean
    capitals: boolean
    numbers: boolean
    layout: string
    language: string
    utcOffsetMinutes: number
}

export interface GuestEvidenceTest {
    localId: string
    completedAt: number
    context: EvidenceContext
    config: EvidenceTestConfiguration
    timeline: EncodedTimeline
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" ? value as Record<string, unknown> : null
}

function integer(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
}

function scalar(value: unknown): value is number {
    return integer(value, 1, 0x10ffff) && (value < 0xd800 || value > 0xdfff)
}

function validTimeline(value: unknown): value is EncodedTimeline {
    const events: unknown = Array.isArray(value) ? value : record(value)?.events
    const version = Array.isArray(value) ? 1 : record(value)?.v
    if (!Array.isArray(events) || events.length > 50_000 || (version !== 1 && version !== 2)) return false

    return events.every((rawEvent) => {
        if (!Array.isArray(rawEvent)) return false
        if (version === 1) {
            if (rawEvent.length !== 3) return false
            const expected: unknown = rawEvent[0]
            const state: unknown = rawEvent[1]
            const delta: unknown = rawEvent[2]
            return integer(expected, 0, 0xffff) && integer(state, 0, 2) && integer(delta, 0, 86_400_000)
        }
        if (rawEvent.length !== 4) return false
        const expected: unknown = rawEvent[0]
        const typed: unknown = rawEvent[1]
        const state: unknown = rawEvent[2]
        const delta: unknown = rawEvent[3]
        if (!integer(state, 0, 2) || !integer(delta, 0, 86_400_000)) return false
        return state === 2
            ? expected === 0 && typed === 0
            : scalar(expected) && (state === 1 ? typed === 0 : scalar(typed))
    })
}

export function parseGuestEvidenceTest(value: unknown): GuestEvidenceTest | null {
    const item = record(value)
    const config = record(item?.config)
    if (!item || !config) return null
    if (typeof item.localId !== "string" || item.localId.length < 1 || item.localId.length > 128) return null
    if (!integer(item.completedAt, 0, Number.MAX_SAFE_INTEGER)) return null
    if (typeof item.context !== "string" || !EVIDENCE_CONTEXTS.includes(item.context as EvidenceContext)) return null
    if (!integer(config.mode, 0, 4) || !integer(config.subMode, 0, 1) || !integer(config.count, 1, 5000)) return null
    if (typeof config.options !== "string" || config.options.length > 250) return null
    if (typeof config.punctuation !== "boolean" || typeof config.capitals !== "boolean" || typeof config.numbers !== "boolean") return null
    if (typeof config.layout !== "string" || config.layout.length < 1 || config.layout.length > 32) return null
    if (typeof config.language !== "string" || config.language.length < 1 || config.language.length > 64) return null
    if (!integer(config.utcOffsetMinutes, -14 * 60, 14 * 60) || !validTimeline(item.timeline)) return null

    return value as GuestEvidenceTest
}
