import { useCallback, useEffect, useRef, useState } from "react"
import {
    addRecentCustomGram,
    emptyRecentCustomGrams,
    mergeRecentCustomGrams,
    parseRecentCustomGrams,
    type RecentCustomGramsSnapshot,
} from "~/lib/customGramsRecent"
import {
    clearPendingRecentCustomGrams,
    readPendingRecentCustomGrams,
    writePendingRecentCustomGrams,
} from "~/lib/customGramsPreferences"
import { api } from "~/utils/api"

function sameSnapshot(left: RecentCustomGramsSnapshot, right: RecentCustomGramsSnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
}

export function useRecentCustomGrams(language: string, signedIn: boolean) {
    const [snapshot, setSnapshot] = useState(() => emptyRecentCustomGrams(language))
    const activeLanguage = useRef(language)
    activeLanguage.current = language
    const attempted = useRef(new Map<string, string>())
    const remote = api.customGramsPreference.get.useQuery(
        { language },
        { enabled: signedIn, retry: false },
    )
    const merge = api.customGramsPreference.merge.useMutation()
    const mutate = merge.mutate

    const syncPending = useCallback((pending: RecentCustomGramsSnapshot) => {
        if (pending.entries.length === 0) return
        const operationLanguage = pending.language
        const signature = JSON.stringify(pending)
        attempted.current.set(operationLanguage, signature)
        mutate({ snapshot: pending }, {
            onSuccess: (result) => {
                const confirmed = parseRecentCustomGrams(result, operationLanguage)
                if (activeLanguage.current === operationLanguage) {
                    setSnapshot((current) => mergeRecentCustomGrams(operationLanguage, current, confirmed))
                }
                const currentPending = readPendingRecentCustomGrams(operationLanguage)
                if (JSON.stringify(currentPending) === signature) {
                    clearPendingRecentCustomGrams(operationLanguage)
                }
            },
        })
    }, [mutate])

    useEffect(() => {
        const pending = readPendingRecentCustomGrams(language)
        if (!signedIn) {
            setSnapshot((current) => sameSnapshot(current, pending) ? current : pending)
            attempted.current.delete(language)
            return
        }
        if (!remote.isSuccess) return

        const account = parseRecentCustomGrams(remote.data, language)
        const converged = mergeRecentCustomGrams(language, account, pending)
        setSnapshot((current) => sameSnapshot(current, converged) ? current : converged)
        const signature = JSON.stringify(pending)
        if (pending.entries.length > 0 && attempted.current.get(language) !== signature) syncPending(pending)
    }, [language, remote.data, remote.isSuccess, signedIn, syncPending])

    const recordDirect = useCallback((gram: string) => {
        const pending = readPendingRecentCustomGrams(language)
        const newestKnown = Math.max(0, ...pending.entries.map((entry) => entry.lastUsedAt), ...snapshot.entries.map((entry) => entry.lastUsedAt))
        const timestamp = Math.max(Date.now(), newestKnown + 1)
        const nextPending = addRecentCustomGram(pending, gram, timestamp)
        writePendingRecentCustomGrams(nextPending)
        setSnapshot((current) => addRecentCustomGram(current, gram, timestamp))
        if (signedIn) syncPending(nextPending)
    }, [language, signedIn, snapshot.entries, syncPending])

    return { entries: snapshot.language === language ? snapshot.entries : [], recordDirect }
}
