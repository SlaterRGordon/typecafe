import type { KeyAttempt } from "./heatmap"
import { keyFor, sequenceFor, type Layer } from "./keyboardLayout"
import type { SkillCandidate } from "./skillEvidence"

export type StickyPracticeLayer = "base" | "shift" | "altgr"

/** Saved focus wins; otherwise choose one evidence-backed key, never an arbitrary default. */
export function initialPracticeKeys(
    savedKeys: readonly string[],
    candidates: readonly SkillCandidate[],
    naturalAttempts: Readonly<Record<string, KeyAttempt>>,
    layout: string,
): string[] {
    const supportedSaved = [...new Set(savedKeys.map((key) => key.normalize("NFC")))]
        .filter((key) => sequenceFor(key, layout).length > 0)
        .slice(0, 8)
    if (supportedSaved.length > 0) return supportedSaved

    const rankedKeys = [...candidates]
        .filter((candidate) => candidate.target.kind === "key")
        .sort((a, b) => b.impactMsPer1000 - a.impactMsPer1000)
        .flatMap((candidate) => candidate.target.kind === "key" ? candidate.target.keys : [])
    const key = rankedKeys.find((candidate) => {
        const physicalKey = keyFor(candidate, layout)
        return sequenceFor(candidate, layout).length > 0 && physicalKey !== null && (naturalAttempts[physicalKey]?.attempts ?? 0) > 0
    })
    return key ? [key.normalize("NFC")] : []
}

/** Clicking an active sticky modifier returns to Base; choosing another replaces it. */
export function nextStickyPracticeLayer(
    current: StickyPracticeLayer,
    selected: Exclude<StickyPracticeLayer, "base">,
): StickyPracticeLayer {
    return current === selected ? "base" : selected
}

/** Physical holds temporarily own the visible layer and may combine. */
export function effectivePracticeKeyboardLayer(
    sticky: StickyPracticeLayer,
    heldShift: boolean,
    heldAltgr: boolean,
): Layer {
    if (heldShift || heldAltgr) {
        return heldShift && heldAltgr ? "shiftAltgr" : heldShift ? "shift" : "altgr"
    }
    return sticky
}
