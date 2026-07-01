import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useDispatch } from "react-redux"
import { addAlert } from "~/state/alert/alertSlice"
import { api } from "~/utils/api"
import {
    fromLevelProgress,
    mergeProgress,
    toLevelProgress,
    type DifficultyName,
    type LevelProgress,
    type PersistedProgress,
} from "~/lib/trainProgression"

const getStorageKey = (difficulty: DifficultyName) => `typecafe.trainProgress.${difficulty}`

export interface TrainProgressStore {
    // The user's ladder progress, converged from whichever source applies.
    completedProgress: LevelProgress[]
    // Account progress exists *and* there's unimported device progress — offer the
    // import button rather than silently merging.
    shouldShowImportPrompt: boolean
    // Signed in with device progress and an empty account — safe to auto-import.
    canSilentImport: boolean
    isImporting: boolean
    isLoading: boolean
    // Persist a cleared-level entry (guest localStorage or DB), resolving with the
    // merged progress and whether it actually saved.
    save: (entry: LevelProgress) => Promise<{ saved: boolean; nextProgress: LevelProgress[] }>
    // Push the guest mirror into the account, resolving with the refreshed account
    // progress (null if it didn't run or failed).
    importDevice: (opts?: { silent?: boolean }) => Promise<LevelProgress[] | null>
}

// Owns the Train ladder's dual-source persistence (ADR-0001): the guest
// localStorage mirror and the signed-in DB rows, converged into one
// completedProgress. save() and importDevice() route on session and resolve with
// the outcome the page reacts to (the modal, the level advance), so the page
// never branches on session itself. The pure merge lives in trainProgression.
export function useTrainProgress(difficulty: DifficultyName): TrainProgressStore {
    const { data: sessionData } = useSession()
    const dispatch = useDispatch()
    const signedIn = !!sessionData?.user

    const [localProgress, setLocalProgress] = useState<LevelProgress[]>([])
    const [isLocalProgressLoaded, setIsLocalProgressLoaded] = useState(false)
    const [optimisticProgress, setOptimisticProgress] = useState<LevelProgress[]>([])

    const {
        data: savedProgress = [],
        refetch: refetchSavedProgress,
        isLoading: isLoadingSavedProgress,
    } = api.trainProgress.getByDifficulty.useQuery({ difficulty }, { enabled: signedIn })
    const importTrainProgress = api.trainProgress.batchImport.useMutation()
    const completeTrainProgress = api.trainProgress.complete.useMutation()

    // Reload the guest mirror and drop optimistic entries on difficulty change —
    // each difficulty is its own ladder.
    useEffect(() => {
        setOptimisticProgress([])
        setIsLocalProgressLoaded(false)
        const stored = window.localStorage.getItem(getStorageKey(difficulty))
        if (!stored) {
            setLocalProgress([])
            setIsLocalProgressLoaded(true)
            return
        }
        try {
            setLocalProgress((JSON.parse(stored) as PersistedProgress[]).map(toLevelProgress))
        } catch {
            setLocalProgress([])
        }
        setIsLocalProgressLoaded(true)
    }, [difficulty])

    const persistedProgress: LevelProgress[] = useMemo(
        () => savedProgress.map(toLevelProgress),
        [savedProgress],
    )
    const accountProgress: LevelProgress[] = useMemo(
        () => optimisticProgress.reduce((progress, entry) => mergeProgress(progress, entry), persistedProgress),
        [optimisticProgress, persistedProgress],
    )
    const completedProgress: LevelProgress[] = signedIn ? accountProgress : localProgress
    const hasDeviceProgress = localProgress.length > 0
    const shouldShowImportPrompt = signedIn && hasDeviceProgress && persistedProgress.length > 0
    const canSilentImport = signedIn && !isLoadingSavedProgress && hasDeviceProgress && persistedProgress.length === 0

    const save = useCallback(async (entry: LevelProgress) => {
        if (!signedIn) {
            const nextProgress = mergeProgress(localProgress, entry)
            window.localStorage.setItem(getStorageKey(difficulty), JSON.stringify(nextProgress.map(fromLevelProgress)))
            setLocalProgress(nextProgress)
            return { saved: true, nextProgress }
        }

        const optimisticNextProgress = mergeProgress(completedProgress, entry)
        try {
            await completeTrainProgress.mutateAsync({ difficulty, progress: fromLevelProgress(entry) })
            const savedResult = await refetchSavedProgress()
            const refreshed = (savedResult.data ?? []).map(toLevelProgress)
            const nextProgress = mergeProgress(
                refreshed.length > 0 ? refreshed : optimisticNextProgress,
                entry,
            )
            setOptimisticProgress((progress) => mergeProgress(progress, entry))
            return { saved: true, nextProgress }
        } catch (error) {
            console.log(error)
            dispatch(addAlert({ message: "Could not refresh level progress.", type: "error" }))
            return { saved: false, nextProgress: completedProgress }
        }
    }, [signedIn, localProgress, difficulty, completedProgress, completeTrainProgress, refetchSavedProgress, dispatch])

    const importDevice = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!signedIn || localProgress.length === 0 || importTrainProgress.isPending) return null
        try {
            await importTrainProgress.mutateAsync({ difficulty, progress: localProgress.map(fromLevelProgress) })
            window.localStorage.removeItem(getStorageKey(difficulty))
            setLocalProgress([])
            const savedResult = await refetchSavedProgress()
            if (!silent) {
                dispatch(addAlert({ message: "Device progress imported to your account.", type: "success" }))
            }
            return (savedResult.data ?? []).map(toLevelProgress)
        } catch (error) {
            console.log(error)
            dispatch(addAlert({ message: "Could not import device progress.", type: "error" }))
            return null
        }
    }, [signedIn, localProgress, difficulty, importTrainProgress, refetchSavedProgress, dispatch])

    const isLoading = !isLocalProgressLoaded ||
        importTrainProgress.isPending ||
        completeTrainProgress.isPending ||
        (signedIn && isLoadingSavedProgress)

    return {
        completedProgress,
        shouldShowImportPrompt,
        canSilentImport,
        isImporting: importTrainProgress.isPending,
        isLoading,
        save,
        importDevice,
    }
}
