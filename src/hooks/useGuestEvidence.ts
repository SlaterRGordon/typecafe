import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { readLocalKeyStats, type LocalKeyStat } from "~/lib/localSync"
import { readLocalTransitions } from "~/lib/localTransitions"
import { readLocalProgress, type LocalProgressEntry } from "~/lib/progressHistory"
import type { TransitionAggregate } from "~/lib/transitions"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { useLayout } from "./useLayout"

export interface GuestEvidence {
    progress: LocalProgressEntry[]
    keyStats: LocalKeyStat[]
    transitions: TransitionAggregate[]
}

// Fired after a completed test's evidence is written (local mirror for guests,
// DB sync for users), so always-mounted surfaces like the coach tab recompute
// instead of serving a recommendation frozen at first page load.
export const EVIDENCE_SYNCED_EVENT = "typecafe:evidence-synced"

// The guest's local-first evidence (progress entries, key stats, transitions),
// read from localStorage after mount to avoid an SSR mismatch and re-read after
// each synced test. Null while signed in (those surfaces read the DB instead)
// and before the first client render. Shared by /progress and /plan, which each
// project it differently. Key stats and transitions follow the active layout's
// stats pool (docs/features/keyboard-layouts.md decision 6); progress history
// is pool-agnostic (the trend follows the language, not the layout).
export function useGuestEvidence(): GuestEvidence | null {
    const { data: sessionData } = useSession()
    const signedIn = !!sessionData?.user
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const [evidence, setEvidence] = useState<GuestEvidence | null>(null)

    useEffect(() => {
        if (signedIn) {
            setEvidence(null)
            return
        }
        const read = () => setEvidence({
            progress: readLocalProgress(),
            keyStats: readLocalKeyStats(pool),
            transitions: readLocalTransitions(pool),
        })
        read()
        window.addEventListener(EVIDENCE_SYNCED_EVENT, read)
        return () => window.removeEventListener(EVIDENCE_SYNCED_EVENT, read)
    }, [signedIn, pool])

    return evidence
}
