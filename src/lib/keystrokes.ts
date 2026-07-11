// Per-keystroke timeline capture + the compact encoding that gets persisted.
// Pure and React-free so it can be unit-tested and reused by diagnosis (this
// phase), trends (Phase 2), and transitions (Phase 3). Everything downstream
// reads from this timeline, so the shape is deliberately minimal and stable.

// One forward keystroke against an expected character. Backspaces are not
// recorded here - diagnosis cares about the latency and correctness of the keys
// the user actually committed to.
export interface KeystrokeEvent {
    // The character the user was meant to type at this position.
    key: string,
    correct: boolean,
    // Wall-clock time of the keystroke, in ms.
    t: number,
}

// Backspaces are persisted as actions too, so the server can replay the final
// cursor/error state instead of trusting client-submitted summary metrics.
export interface BackspaceEvent {
    action: "backspace",
    t: number,
}

export type TestEvidenceEvent = KeystrokeEvent | BackspaceEvent

// Compact wire format: one [charCode, state, dtMs] triple per action, where dtMs
// is the gap since the previous action (the first is 0). Deltas,
// not absolute times, so a 60s test stays a few KB. This is exactly the JSON we
// persist on Test.timeline.
// The middle value is 0/1 for an incorrect/correct forward keystroke and 2 for
// a backspace. Existing timelines remain valid because their forward encoding
// is unchanged.
export type EncodedKeystroke = [number, 0 | 1 | 2, number]

// Total elapsed typing time of an encoded timeline (sum of inter-key gaps, in
// ms). The first keystroke contributes 0, so this is the span from the first to
// the last committed key - the duration figure used to judge whether a sample is
// substantial enough to rank.
export function timelineDurationMs(encoded: EncodedKeystroke[]): number {
    let total = 0
    for (const [, , dtMs] of encoded) total += Math.max(0, dtMs)
    return total
}

export function encodeTimeline(events: TestEvidenceEvent[]): EncodedKeystroke[] {
    const encoded: EncodedKeystroke[] = []
    let prevT: number | null = null
    for (const event of events) {
        const dtMs = prevT == null ? 0 : Math.max(event.t - prevT, 0)
        encoded.push("action" in event
            ? [8, 2, dtMs]
            : [event.key.charCodeAt(0), event.correct ? 1 : 0, dtMs])
        prevT = event.t
    }
    return encoded
}

// Decode the complete replay stream, including edits. Metric derivation uses
// this; diagnosis/transition consumers use decodeTimeline below and continue to
// receive only committed forward attempts.
export function decodeEvidenceTimeline(encoded: EncodedKeystroke[]): TestEvidenceEvent[] {
    const events: TestEvidenceEvent[] = []
    let t = 0
    for (const [code, state, dtMs] of encoded) {
        t += dtMs
        if (state === 2) events.push({ action: "backspace", t })
        else events.push({ key: String.fromCharCode(code), correct: state === 1, t })
    }
    return events
}

// Rebuild events from the compact form. Absolute time is reconstructed from a
// base of 0 (only inter-key gaps are meaningful, so the base is arbitrary).
export function decodeTimeline(encoded: EncodedKeystroke[]): KeystrokeEvent[] {
    return decodeEvidenceTimeline(encoded).filter((event): event is KeystrokeEvent => !("action" in event))
}

export interface KeyLatency {
    key: string,
    // Mean inter-key latency (ms) of keystrokes that landed on this key.
    meanMs: number,
    samples: number,
}

// Per-key latency aggregation. The latency "of" a keystroke is the gap from the
// previous keystroke to it - i.e. how long the user took to produce that key -
// so the very first keystroke (no predecessor) is excluded.
export function aggregateKeyLatency(events: KeystrokeEvent[]): Map<string, { totalMs: number, samples: number }> {
    const byKey = new Map<string, { totalMs: number, samples: number }>()
    for (let i = 1; i < events.length; i++) {
        const event = events[i]!
        const dtMs = Math.max(event.t - events[i - 1]!.t, 0)
        const entry = byKey.get(event.key) ?? { totalMs: 0, samples: 0 }
        entry.totalMs += dtMs
        entry.samples += 1
        byKey.set(event.key, entry)
    }
    return byKey
}

// Mean latency across every measured keystroke (the whole test's rhythm). Used
// as the baseline a single key is judged "slow" against. Returns 0 when there
// is nothing measurable (0 or 1 keystrokes).
export function overallMeanLatency(events: KeystrokeEvent[]): number {
    let totalMs = 0
    let samples = 0
    for (let i = 1; i < events.length; i++) {
        totalMs += Math.max(events[i]!.t - events[i - 1]!.t, 0)
        samples += 1
    }
    return samples === 0 ? 0 : totalMs / samples
}

// Per-key mean latency as a sorted list (slowest first), filtered to keys with
// enough samples to be a pattern rather than a single slip.
export function keyLatencies(events: KeystrokeEvent[], minSamples = 1): KeyLatency[] {
    return Array.from(aggregateKeyLatency(events).entries())
        .filter(([, value]) => value.samples >= minSamples)
        .map(([key, value]) => ({ key, meanMs: value.totalMs / value.samples, samples: value.samples }))
        .sort((a, b) => b.meanMs - a.meanMs)
}
