interface GramProgressionInput {
    promptText: string
    characterCount: number
    speed: number
    durationSeconds: number
    accuracy: number
    wpmThreshold: number
    accuracyThreshold: number
}

export function gramPassesThresholds({
    promptText,
    speed,
    characterCount,
    durationSeconds,
    accuracy,
    wpmThreshold,
    accuracyThreshold,
}: GramProgressionInput): boolean {
    const isSingleCharacterPrompt = promptText.length === 1 && characterCount === 1
    return accuracy >= accuracyThreshold && (isSingleCharacterPrompt || (
        speed >= wpmThreshold &&
        characterCount > 0 &&
        durationSeconds > 0
    ))
}
