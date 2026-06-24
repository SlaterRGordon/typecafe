import type { TypedSegment } from "./stats"

function formatOneDecimal(value: number): string {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
    })
}

export function beatRunBrag(deltaWpm: number, attemptNumber = 1): string {
    const suffix = attemptNumber > 1 ? ` (best of ${attemptNumber})` : ""
    if (deltaWpm >= 0) return `Beat by +${formatOneDecimal(deltaWpm)} WPM${suffix}`
    return `Within ${formatOneDecimal(Math.abs(deltaWpm))} WPM${suffix}`
}

export function beatRunAttemptLabel(attemptNumber: number): string {
    if (attemptNumber <= 1) return "First attempt"
    return `Retry ${attemptNumber} - first attempt stays comparable`
}

export function firstDivergenceWord(promptText: string, typedSegments: TypedSegment[]): string | null {
    const mismatchIndex = typedSegments.findIndex((segment, index) => segment.ch !== promptText[index] || !segment.correct)
    if (mismatchIndex < 0) return null

    const left = promptText.lastIndexOf(" ", Math.max(mismatchIndex - 1, 0)) + 1
    const right = promptText.indexOf(" ", mismatchIndex)
    const word = promptText.slice(left, right === -1 ? undefined : right).trim()
    return word.length > 0 ? word : null
}
