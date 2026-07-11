import { useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useDispatch } from "react-redux"
import { addAlert } from "~/state/alert/alertSlice"
import { addLocalKeyStats } from "~/lib/localSync"
import { addLocalTransitions } from "~/lib/localTransitions"
import { EVIDENCE_SYNCED_EVENT } from "~/hooks/useGuestEvidence"
import { aggregateTransitions } from "~/lib/transitions"
import { drainSyncedAttempts } from "~/lib/practiceAttempts"
import type { EncodedKeystroke, KeystrokeEvent } from "~/lib/keystrokes"
import { api } from "~/utils/api"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { useLayout } from "~/hooks/useLayout"
import type { TestCompletionResult, TestModes } from "../types"

export interface CreateTestInput {
    typeId: string,
    count: number,
    options: string,
    punctuation: boolean,
    capitals: boolean,
    timeline: EncodedKeystroke[],
    utcOffsetMinutes?: number,
    challengeDate?: string,
}

interface UseTestPersistenceArgs {
    mode: TestModes,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    onTestComplete?: (result: TestCompletionResult) => void,
    // Show the result instantly instead of waiting for the save round-trip: report
    // completion once up front (unpersisted), then again with the server-derived
    // fields when the save settles. Only safe for callers whose onTestComplete is
    // idempotent under a double-call (the home page); off by default.
    eagerResult?: boolean,
}

// Owns everything that talks to the server after a test: saving the score (and
// reporting completion back once the save settles) and syncing per-character
// practice stats.
export function useTestPersistence({ charAttemptsRef, onTestComplete, eagerResult = false }: UseTestPersistenceArgs) {
    const { data: sessionData } = useSession()
    const dispatch = useDispatch()
    const utils = api.useUtils()
    // Every save carries the active layout: tests tag the actual id (honesty,
    // ledger decision 10), aggregates key their stats pool (decision 6).
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const pendingCompletionRef = useRef<TestCompletionResult | null>(null)

    const createTest = api.test.create.useMutation({
        onSuccess: (test) => {
            const completion = pendingCompletionRef.current
            if (completion) {
                onTestComplete?.({ ...completion, persisted: true, testId: test.id, ranked: test.ranked, brag: test.brag, avgDelta: test.avgDelta, streak: test.streak })
                pendingCompletionRef.current = null
            }
        },
        onError: (error) => {
            console.error(error)
            // The save failed, but the user still finished the test — show their
            // results instead of a blank screen, just unpersisted.
            const completion = pendingCompletionRef.current
            if (completion) {
                onTestComplete?.({ ...completion, persisted: false })
                pendingCompletionRef.current = null
            }
            dispatch(addAlert({
                message: "Couldn't save your score — check your connection and try again.",
                type: "warning",
            }))
        }
    })

    // Save a completed test for the signed-in user; completion is reported via
    // the mutation callbacks above so the result can carry the test id and brag.
    // When eager, also report it immediately (unpersisted) so the result card
    // shows without waiting for the save — the callbacks then patch it in place.
    const persistCompletion = useCallback((completion: TestCompletionResult, input: CreateTestInput) => {
        pendingCompletionRef.current = completion
        if (eagerResult) onTestComplete?.(completion)
        createTest.mutate({ ...input, layout })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createTest.mutate, eagerResult, onTestComplete, layout])

    // Both sync mutations invalidate their lifetime read so always-mounted
    // surfaces (the coach tab) recompute from data that includes this test.
    // The drain must live here (hook-level), not as a mutate-level callback:
    // drill/train unmount the Typer the moment the eager result shows, and
    // react-query skips mutate-level callbacks once the observer has no
    // listeners — the synced attempts would never drain and the next sync
    // would re-send (double-count) them. Hook-level callbacks ride the
    // mutation itself and fire regardless of mount.
    const { mutate: syncPracticeStats } = api.practiceStats.batchSync.useMutation({
        onSuccess: (_data, variables) => {
            drainSyncedAttempts(charAttemptsRef.current, variables.stats)
            void utils.practiceStats.get.invalidate()
        },
        onError: (error) => {
            console.error(error)
        },
    })

    const { mutate: syncTransitionStats } = api.transitionStats.batchSync.useMutation({
        onSuccess: () => void utils.transitionStats.get.invalidate(),
        onError: (error) => {
            console.error(error)
        },
    })

    // Derived-on-write transition analytics (§4.1): roll the completed test's
    // timeline into per-pair aggregates and add them to the user's lifetime data
    // (DB when signed in, localStorage mirror for guests). Computed once per test.
    const syncTransitions = useCallback((events: KeystrokeEvent[]) => {
        const aggregates = aggregateTransitions(events)
        if (aggregates.length === 0) return
        if (!sessionData?.user) {
            addLocalTransitions(aggregates, pool)
            window.dispatchEvent(new Event(EVIDENCE_SYNCED_EVENT))
            return
        }
        syncTransitionStats({ stats: aggregates, pool })
    }, [sessionData?.user, syncTransitionStats, pool])

    // Per-key accuracy is tracked in every mode (Normal, Quotes, Practice, Drill),
    // not just Practice — the heatmap and smart drill want the user's real typing,
    // wherever it happens. Ngrams is excluded by the callers in Typer because its
    // repeated-gram text would skew the per-key picture.
    const syncCharAttempts = useCallback(() => {
        const stats = Array.from(charAttemptsRef.current.entries()).map(
            ([character, value]) => ({
                character,
                total: value.attempts,
                correct: value.correct,
            }),
        )

        if (stats.length === 0) return

        if (!sessionData?.user) {
            const saved = addLocalKeyStats(stats.map((stat) => ({
                key: stat.character,
                attempts: stat.total,
                correct: stat.correct,
            })), pool)

            if (saved) {
                drainSyncedAttempts(charAttemptsRef.current, stats)
                window.dispatchEvent(new Event(EVIDENCE_SYNCED_EVENT))
            }
            return
        }

        syncPracticeStats({ stats, pool })
    }, [charAttemptsRef, sessionData?.user, syncPracticeStats, pool])

    return { sessionData, persistCompletion, syncCharAttempts, syncTransitions, isSaving: createTest.isPending }
}
