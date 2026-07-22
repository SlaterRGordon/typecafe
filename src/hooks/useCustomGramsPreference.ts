import { useCallback, useEffect, useRef, useState } from "react"
import {
    addRecentCustomGram,
    emptyCustomGramsPreference,
    mergeCustomGramsPreferences,
    parseCustomGramsPreference,
    updateCustomGramsSetup,
    type CustomGramsPreferenceSnapshot,
} from "~/lib/customGramsPreference"
import type { CustomGramsPracticePreferences } from "~/lib/customGramsPractice"
import {
    clearPendingCustomGramsPreference,
    readPendingCustomGramsPreference,
    writePendingCustomGramsPreference,
} from "~/lib/customGramsPreferences"
import { api } from "~/utils/api"

function sameSnapshot(left: CustomGramsPreferenceSnapshot, right: CustomGramsPreferenceSnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
}

function hasPending(snapshot: CustomGramsPreferenceSnapshot): boolean {
    return snapshot.entries.length > 0 || snapshot.setup !== null
}

export function useCustomGramsPreference(language: string, signedIn: boolean) {
    const [snapshot, setSnapshot] = useState(() => emptyCustomGramsPreference(language))
    const scope = `${signedIn ? "account" : "guest"}\0${language}`
    const [resolvedScope, setResolvedScope] = useState<string | null>(null)
    const activeLanguage = useRef(language)
    activeLanguage.current = language
    const attempted = useRef(new Map<string, string>())
    const confirmedAccounts = useRef(new Map<string, CustomGramsPreferenceSnapshot>())
    const remote = api.customGramsPreference.get.useQuery(
        { language },
        { enabled: signedIn, retry: false },
    )
    const merge = api.customGramsPreference.merge.useMutation()
    const mutate = merge.mutate

    const syncPending = useCallback((pending: CustomGramsPreferenceSnapshot) => {
        if (!hasPending(pending)) return
        const operationLanguage = pending.language
        const signature = JSON.stringify(pending)
        attempted.current.set(operationLanguage, signature)
        mutate({ snapshot: pending }, {
            onSuccess: (result) => {
                const confirmed = parseCustomGramsPreference(result, operationLanguage)
                confirmedAccounts.current.set(operationLanguage, confirmed)
                if (activeLanguage.current === operationLanguage) {
                    setSnapshot((current) => mergeCustomGramsPreferences(operationLanguage, current, confirmed))
                }
                const currentPending = readPendingCustomGramsPreference(operationLanguage)
                if (JSON.stringify(currentPending) === signature) clearPendingCustomGramsPreference(operationLanguage)
            },
        })
    }, [mutate])

    useEffect(() => {
        const pending = readPendingCustomGramsPreference(language)
        if (!signedIn) {
            confirmedAccounts.current.clear()
            setSnapshot((current) => sameSnapshot(current, pending) ? current : pending)
            setResolvedScope(scope)
            attempted.current.delete(language)
            return
        }
        if (!remote.isSuccess) {
            setResolvedScope((current) => current === scope ? null : current)
            return
        }
        const account = mergeCustomGramsPreferences(
            language,
            parseCustomGramsPreference(remote.data, language),
            confirmedAccounts.current.get(language),
        )
        const converged = mergeCustomGramsPreferences(language, account, pending)
        setSnapshot((current) => sameSnapshot(current, converged) ? current : converged)
        setResolvedScope(scope)
        const signature = JSON.stringify(pending)
        if (hasPending(pending) && attempted.current.get(language) !== signature) syncPending(pending)
    }, [language, remote.data, remote.isSuccess, scope, signedIn, syncPending])

    const recordDirect = useCallback((gram: string) => {
        const pending = readPendingCustomGramsPreference(language)
        const newestKnown = Math.max(0, ...pending.entries.map((entry) => entry.lastUsedAt), ...snapshot.entries.map((entry) => entry.lastUsedAt))
        const timestamp = Math.max(Date.now(), newestKnown + 1)
        const nextPending = addRecentCustomGram(pending, gram, timestamp)
        writePendingCustomGramsPreference(nextPending)
        setSnapshot((current) => addRecentCustomGram(current, gram, timestamp))
        if (signedIn) syncPending(nextPending)
    }, [language, signedIn, snapshot.entries, syncPending])

    const saveSetup = useCallback((preferences: CustomGramsPracticePreferences) => {
        const pending = readPendingCustomGramsPreference(language)
        const newestKnown = Math.max(0, pending.setup?.updatedAt ?? 0, snapshot.setup?.updatedAt ?? 0)
        const timestamp = Math.max(Date.now(), newestKnown + 1)
        const nextPending = updateCustomGramsSetup(pending, preferences, timestamp)
        writePendingCustomGramsPreference(nextPending)
        setSnapshot((current) => updateCustomGramsSetup(current, preferences, timestamp))
        if (signedIn) syncPending(nextPending)
    }, [language, signedIn, snapshot.setup?.updatedAt, syncPending])

    const loaded = resolvedScope === scope && snapshot.language === language
    return {
        entries: loaded ? snapshot.entries : [],
        setup: loaded ? snapshot.setup : null,
        loaded,
        scope,
        recordDirect,
        saveSetup,
    }
}
