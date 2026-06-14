import { useCallback, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useDispatch } from "react-redux"
import { addAlert } from "~/state/alert/alertSlice"
import { addLocalKeyStats, clearLocalKeyStats, readLocalKeyStats } from "~/lib/localSync"
import { api } from "~/utils/api"
import { TestModes } from "../types"
import type { TestCompletionResult } from "../types"

export interface CreateTestInput {
    typeId: string,
    accuracy: number,
    speed: number,
    score: number,
    count: number,
    options: string,
    punctuation: boolean,
    capitals: boolean,
    ranked: boolean,
}

interface UseTestPersistenceArgs {
    mode: TestModes,
    charAttemptsRef: React.MutableRefObject<Map<string, { attempts: number, correct: number }>>,
    onTestComplete?: (result: TestCompletionResult) => void,
}

// Owns everything that talks to the server after a test: saving the score (and
// reporting completion back once the save settles) and syncing per-character
// practice stats.
export function useTestPersistence({ mode, charAttemptsRef, onTestComplete }: UseTestPersistenceArgs) {
    const { data: sessionData } = useSession()
    const dispatch = useDispatch()
    const pendingCompletionRef = useRef<TestCompletionResult | null>(null)
    const importedLocalStatsRef = useRef(false)

    const createTest = api.test.create.useMutation({
        onSuccess: (test) => {
            const completion = pendingCompletionRef.current
            if (completion) {
                onTestComplete?.({ ...completion, persisted: true, testId: test.id, brag: test.brag })
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
    const persistCompletion = useCallback((completion: TestCompletionResult, input: CreateTestInput) => {
        pendingCompletionRef.current = completion
        createTest.mutate(input)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createTest.mutate])

    const { mutate: syncPracticeStats } = api.practiceStats.batchSync.useMutation({
        onError: (error) => {
            console.error(error)
        },
    })

    useEffect(() => {
        if (!sessionData?.user) return
        if (importedLocalStatsRef.current) return

        const localStats = readLocalKeyStats()
        if (localStats.length === 0) return

        importedLocalStatsRef.current = true
        syncPracticeStats({
            stats: localStats.map((stat) => ({
                character: stat.key,
                total: stat.attempts,
                correct: stat.correct,
            })),
        }, {
            onSuccess: () => {
                clearLocalKeyStats()
            },
            onError: (error) => {
                console.error(error)
                importedLocalStatsRef.current = false
            },
        })
    }, [sessionData?.user, syncPracticeStats])

    const syncCharAttempts = useCallback(() => {
        if (mode !== TestModes.practice) return

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
            })))

            if (saved) {
                for (const stat of stats) {
                    const current = charAttemptsRef.current.get(stat.character)
                    if (!current) continue
                    const attempts = current.attempts - stat.total
                    const correct = current.correct - stat.correct
                    if (attempts <= 0) charAttemptsRef.current.delete(stat.character)
                    else charAttemptsRef.current.set(stat.character, { attempts, correct: Math.max(correct, 0) })
                }
            }
            return
        }

        syncPracticeStats({ stats }, {
            onSuccess: () => {
                // Subtract exactly what was synced rather than deleting the key —
                // keystrokes typed while the request was in flight must survive
                // for the next sync.
                for (const stat of stats) {
                    const current = charAttemptsRef.current.get(stat.character)
                    if (!current) continue
                    const attempts = current.attempts - stat.total
                    const correct = current.correct - stat.correct
                    if (attempts <= 0) charAttemptsRef.current.delete(stat.character)
                    else charAttemptsRef.current.set(stat.character, { attempts, correct: Math.max(correct, 0) })
                }
            },
        })
    }, [charAttemptsRef, mode, sessionData?.user, syncPracticeStats])

    return { sessionData, persistCompletion, syncCharAttempts }
}
