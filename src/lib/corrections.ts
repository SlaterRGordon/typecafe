import type { KeystrokeEvent, TestEvidenceEvent } from "./keystrokes"

export interface CorrectionEpisode {
    expected: string
    typed: string
    errorAt: number
    firstBackspaceAt: number
    correctedAt: number
    backspaces: number
    // Delay before the user began repairing the error.
    reactionTimeMs: number
    // Total time from the miss through the successful replacement.
    costMs: number
}

interface PendingCorrection {
    expected: string
    typed: string
    errorAt: number
    firstBackspaceAt: number
    backspaces: number
}

// Replays one attempt while retaining corrected-away errors. An episode starts
// only after an incorrect character is removed and completes only when the same
// prompt position is typed correctly. This prevents an uncorrected miss from
// being misreported as correction evidence.
export function correctionEpisodes(events: TestEvidenceEvent[]): CorrectionEpisode[] {
    const stack: KeystrokeEvent[] = []
    const pendingByPosition = new Map<number, PendingCorrection>()
    const episodes: CorrectionEpisode[] = []

    for (const event of events) {
        if ("action" in event) {
            for (const pending of pendingByPosition.values()) pending.backspaces += 1

            const removed = stack.pop()
            if (removed && !removed.correct && removed.typed !== null) {
                const position = stack.length
                if (!pendingByPosition.has(position)) {
                    pendingByPosition.set(position, {
                        expected: removed.key,
                        typed: removed.typed,
                        errorAt: removed.t,
                        firstBackspaceAt: event.t,
                        backspaces: 1,
                    })
                }
            }
            continue
        }

        const position = stack.length
        const pending = pendingByPosition.get(position)
        if (event.correct && pending && event.key === pending.expected) {
            episodes.push({
                expected: pending.expected,
                typed: pending.typed,
                errorAt: pending.errorAt,
                firstBackspaceAt: pending.firstBackspaceAt,
                correctedAt: event.t,
                backspaces: pending.backspaces,
                reactionTimeMs: Math.max(0, pending.firstBackspaceAt - pending.errorAt),
                costMs: Math.max(0, event.t - pending.errorAt),
            })
            pendingByPosition.delete(position)
        }
        stack.push(event)
    }

    return episodes
}
