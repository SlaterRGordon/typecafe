// Per-keystroke timeline capture + the compact encoding that gets persisted.
// Pure and React-free: this is the compatibility seam for every historical
// timeline and every scoring, replay, and diagnosis consumer.

// One forward keystroke against an expected character. Legacy incorrect events
// cannot recover the actual key, so `typed` is null only when decoding v1 data.
export interface KeystrokeEvent {
    // The character the user was meant to type at this position.
    key: string,
    // The character actually typed. Correct attempts are reconstructed from the
    // expected character because v2 stores them as zero to stay compact.
    typed: string | null,
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

// Legacy compact wire format. The middle value is 0/1 for an
// incorrect/correct forward keystroke and 2 for a backspace.
export type EncodedKeystroke = [expectedCodeUnit: number, state: 0 | 1 | 2, dtMs: number]
export type EncodedTimelineV1 = EncodedKeystroke[]

// Current compact wire format. Correct attempts use typedCodePoint=0 (same as
// expected), incorrect attempts retain the actual typed character, and
// Backspace uses zero for both character fields.
export type EncodedKeystrokeV2 = [
    expectedCodePoint: number,
    typedCodePointOrZero: number,
    state: 0 | 1 | 2,
    dtMs: number,
]
export interface EncodedTimelineV2 {
    v: 2,
    events: EncodedKeystrokeV2[],
}

export type EncodedTimeline = EncodedTimelineV1 | EncodedTimelineV2

function isUnicodeScalar(value: number): boolean {
    if (!Number.isInteger(value) || value < 1 || value > 0x10ffff) return false
    return value < 0xd800 || value > 0xdfff
}

function codePoint(character: string): number {
    return character.codePointAt(0) ?? 0
}

function encodedDeltas(encoded: EncodedTimeline): number[] {
    return Array.isArray(encoded)
        ? encoded.map(([, , dtMs]) => dtMs)
        : encoded.events.map(([, , , dtMs]) => dtMs)
}

// Inter-action deltas are the only timeline detail anti-cheat needs. Keeping the
// normalization here guarantees v1/v2 rankability checks stay identical.
export function timelineDeltasMs(encoded: EncodedTimeline): number[] {
    return encodedDeltas(encoded).map((dtMs) => Math.max(0, dtMs))
}

// Total elapsed typing time (sum of inter-key gaps). The first keystroke
// contributes 0, so this is the span from the first to the last action.
export function timelineDurationMs(encoded: EncodedTimeline): number {
    return timelineDeltasMs(encoded).reduce((total, dtMs) => total + dtMs, 0)
}

export function encodeTimeline(events: TestEvidenceEvent[]): EncodedTimelineV2 {
    const encoded: EncodedKeystrokeV2[] = []
    let prevT: number | null = null
    for (const event of events) {
        const dtMs = prevT == null ? 0 : Math.max(event.t - prevT, 0)
        if ("action" in event) {
            encoded.push([0, 0, 2, dtMs])
        } else {
            const expected = codePoint(event.key)
            const typed = event.correct ? 0 : codePoint(event.typed ?? "")
            if (!isUnicodeScalar(expected) || (!event.correct && !isUnicodeScalar(typed))) {
                throw new Error("Timeline events require one valid expected and typed code point")
            }
            encoded.push([expected, typed, event.correct ? 1 : 0, dtMs])
        }
        prevT = event.t
    }
    return { v: 2, events: encoded }
}

// Decode the complete replay stream, including edits, to one domain shape.
export function decodeEvidenceTimeline(encoded: EncodedTimeline): TestEvidenceEvent[] {
    const events: TestEvidenceEvent[] = []
    let t = 0

    if (Array.isArray(encoded)) {
        for (const [code, state, rawDtMs] of encoded) {
            t += Math.max(0, rawDtMs)
            if (state === 2) {
                events.push({ action: "backspace", t })
            } else {
                const key = String.fromCharCode(code)
                events.push({ key, typed: state === 1 ? key : null, correct: state === 1, t })
            }
        }
        return events
    }

    for (const [expectedCode, typedCode, state, rawDtMs] of encoded.events) {
        t += Math.max(0, rawDtMs)
        if (state === 2) {
            events.push({ action: "backspace", t })
        } else {
            const key = String.fromCodePoint(expectedCode)
            events.push({
                key,
                typed: state === 1 ? key : String.fromCodePoint(typedCode),
                correct: state === 1,
                t,
            })
        }
    }
    return events
}

// Rebuild forward attempts from the compact form. Absolute time is reconstructed
// from a base of 0 because only inter-key gaps are meaningful.
export function decodeTimeline(encoded: EncodedTimeline): KeystrokeEvent[] {
    return decodeEvidenceTimeline(encoded).filter((event): event is KeystrokeEvent => !("action" in event))
}

export interface KeyLatency {
    key: string,
    meanMs: number,
    samples: number,
}

// Per-key latency aggregation. The latency "of" a keystroke is the gap from the
// previous keystroke to it, so the first keystroke is excluded.
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

export function overallMeanLatency(events: KeystrokeEvent[]): number {
    let totalMs = 0
    let samples = 0
    for (let i = 1; i < events.length; i++) {
        totalMs += Math.max(events[i]!.t - events[i - 1]!.t, 0)
        samples += 1
    }
    return samples === 0 ? 0 : totalMs / samples
}

export function keyLatencies(events: KeystrokeEvent[], minSamples = 1): KeyLatency[] {
    return Array.from(aggregateKeyLatency(events).entries())
        .filter(([, value]) => value.samples >= minSamples)
        .map(([key, value]) => ({ key, meanMs: value.totalMs / value.samples, samples: value.samples }))
        .sort((a, b) => b.meanMs - a.meanMs)
}
