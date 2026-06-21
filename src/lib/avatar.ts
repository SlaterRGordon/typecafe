// Deterministic avatar styling for users with no picture: a stable colour and
// initial derived from their name, so every account is visually distinct without
// storing anything. Pure and unit-tested.

// Hash a seed (username/name) to a hue. Stable across renders and devices for the
// same seed; small input changes spread widely so adjacent users look distinct.
export function avatarColor(seed: string): string {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
        hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0
    }
    const hue = ((hash % 360) + 360) % 360
    // Fixed saturation/lightness tuned for white text on the dark theme.
    return `hsl(${hue}, 58%, 45%)`
}

// The single uppercase initial shown in a no-picture avatar. Falls back to "?"
// for a missing/blank name so we never render an empty circle.
export function avatarInitial(name?: string | null): string {
    const trimmed = name?.trim()
    return trimmed && trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?"
}
