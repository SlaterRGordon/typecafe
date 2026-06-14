import { useCallback, useState } from "react"
import type { TestGramScopes } from "../types"

// Owns the n-gram drill progression: which level the user is on and their
// running average WPM across completed levels.
export function useGramProgression(gramScope: TestGramScopes) {
    const [gramLevel, setGramLevel] = useState(1)
    const [gramWpm, setGramWpm] = useState(0.00)

    const resetProgression = useCallback(() => {
        setGramLevel(1)
        setGramWpm(0.00)
    }, [])

    // Called when a gram level was completed above the configured thresholds:
    // advance to the next level, folding the level's speed into the running
    // average, and wrap back to level 1 at the end of the scope.
    const recordPassedLevel = useCallback((speed: number) => {
        setGramLevel((level) => {
            if (level < gramScope - 1) {
                setGramWpm((average) => level !== 1 ? ((average * level) + speed) / (level + 1) : speed)
                return level + 1
            }
            if (level === gramScope - 1) {
                setGramWpm(0.00)
                return 1
            }
            return level
        })
    }, [gramScope])

    return { gramLevel, gramWpm, resetProgression, recordPassedLevel }
}
