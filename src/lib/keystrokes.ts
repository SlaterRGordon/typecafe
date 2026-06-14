// Per-keystroke timeline capture + the compact encoding that gets persisted.
// Pure and React-free so it can be unit-tested and reused by diagnosis (this
// phase), trends (Phase 2), and transitions (Phase 3). Everything downstream
// reads from this timeline, so the shape is deliberately minimal and stable.

// One forward keystroke against an expected character. Backspaces are not
// recorded here — diagnosis cares about the latency and correctness of the keys
// the user actually committed to.
export interface KeystrokeEvent {
    // The character the user was meant to type at this position.
    key: string,
    correct: boolean,
    // Wall-clock time of the keystroke, in ms.
    t: number,
}

// Compact wire format: one [charCode, correct(0|1), dtMs] triple per keystroke,
// where dtMs is the gap since the previous keystroke (the first is 0). Deltas,
// not absolute times, so a 60s test stays a few KB. This is exactly the JSON we
// persist on Test.timeline.
export type EncodedKeystroke = [number, 0 | 1, number]

export function encodeTimeline(events: KeystrokeEvent[]): EncodedKeystroke[] {
    const encoded: EncodedKeystroke[] = []
    let prevT: number | null = null
    for (const event of events) {
        const dtMs = prevT == null ? 0 : Math.max(event.t - prevT, 0)
        encoded.push([event.key.charCodeAt(0), event.correct ? 1 : 0, dtMs])
        prevT = event.t
    }
    return encoded
}

// Rebuild events from the compact form. Absolute time is reconstructed from a
// base of 0 (only inter-key gaps are meaningful, so the base is arbitrary).
export function decodeTimeline(encoded: EncodedKeystroke[]): KeystrokeEvent[] {
    const events: KeystrokeEvent[] = []
    let t = 0
    for (const [code, correct, dtMs] of encoded) {
        t += dtMs
        events.push({ key: String.fromCharCode(code), correct: correct === 1, t })
    }
    return events
}

export interface KeyLatency {
    key: string,
    // Mean inter-key latency (ms) of keystrokes that landed on this key.
    meanMs: number,
    samples: number,
}

// Per-key latency aggregation. The latency "of" a keystroke is the gap from the
// previous keystroke to it — i.e. how long the user took to produce that key —
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
