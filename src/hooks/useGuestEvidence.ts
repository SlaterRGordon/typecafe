import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { readLocalKeyStats, type LocalKeyStat } from "~/lib/localSync"
import { readLocalTransitions } from "~/lib/localTransitions"
import { readLocalProgress, type LocalProgressEntry } from "~/lib/progressHistory"
import type { TransitionAggregate } from "~/lib/transitions"

export interface GuestEvidence {
    progress: LocalProgressEntry[]
    keyStats: LocalKeyStat[]
    transitions: TransitionAggregate[]
}

// The guest's local-first evidence (progress entries, key stats, transitions),
// read from localStorage after mount to avoid an SSR mismatch. Null while signed
// in (those surfaces read the DB instead) and before the first client render.
// Shared by /progress and /plan, which each project it differently.
export function useGuestEvidence(): GuestEvidence | null {
    const { data: sessionData } = useSession()
    const signedIn = !!sessionData?.user
    const [evidence, setEvidence] = useState<GuestEvidence | null>(null)

    useEffect(() => {
        if (signedIn) {
            setEvidence(null)
            return
        }
        setEvidence({
            progress: readLocalProgress(),
            keyStats: readLocalKeyStats(),
            transitions: readLocalTransitions(),
        })
    }, [signedIn])

    return evidence
}
