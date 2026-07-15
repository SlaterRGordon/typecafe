import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { accentsFor, ensureLanguageLoaded, getWords } from "~/components/typer/utils"
import {
    clearLocalDailySessions,
    createDailySession,
    DAILY_COACHING_UPDATED_EVENT,
    GUEST_DAILY_SCOPE,
    completedSetCount,
    localDateKey,
    msUntilNextLocalDate,
    parseDailySession,
    preferDailySession,
    previousDateKey,
    readLocalDailySession,
    writeLocalDailySession,
    yesterdayOutcomeFrom,
    type DailyCoachingSession,
} from "~/lib/dailyCoaching"
import { isDrillableOn } from "~/lib/drillKeys"
import { drillFindingFromCandidate, nextDrillFinding, type DrillFinding } from "~/lib/drillProgress"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { analyzeTypingEvidence } from "~/lib/skillEvidence"
import { api } from "~/utils/api"
import { useGuestEvidence } from "./useGuestEvidence"
import { useLanguage } from "./useLanguage"
import { useLayout } from "./useLayout"

function sameSession(a: DailyCoachingSession | null, b: DailyCoachingSession | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
}

export interface DailyCoaching {
    session: DailyCoachingSession | null
    loading: boolean
    // The single next thing worth drilling, from live evidence - the calibration
    // done-card reveals it the moment the mapping Test lands.
    finding: DrillFinding | null
}

export function useDailyCoachingSession(): DailyCoaching {
    const { data: auth, status: authStatus } = useSession()
    const signedIn = authStatus === "authenticated" && !!auth?.user
    const scope = signedIn ? auth.user.id : GUEST_DAILY_SCOPE
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const [dateKey, setDateKey] = useState(() => localDateKey())
    const guest = useGuestEvidence()
    const [accentChars, setAccentChars] = useState<string[] | null>(null)
    const [dailySession, setDailySession] = useState<DailyCoachingSession | null>(null)
    // True while a guest-scope session is being adopted into a signed-in account;
    // the guest mirror is cleared only after that save lands (GuestImport rule).
    const carriedGuestRef = useRef(false)

    useEffect(() => {
        const schedule = () => window.setTimeout(() => {
            setDateKey(localDateKey())
        }, msUntilNextLocalDate() + 1_000)
        const timeout = schedule()
        return () => window.clearTimeout(timeout)
    }, [dateKey])

    // Timers don't tick through system sleep: a laptop opened in the morning
    // would keep yesterday's session until the stale timeout fired. Re-check the
    // local date whenever the tab regains attention.
    useEffect(() => {
        const check = () => setDateKey((key) => {
            const now = localDateKey()
            return now === key ? key : now
        })
        window.addEventListener("focus", check)
        document.addEventListener("visibilitychange", check)
        return () => {
            window.removeEventListener("focus", check)
            document.removeEventListener("visibilitychange", check)
        }
    }, [])

    useEffect(() => {
        let alive = true
        setAccentChars(null)
        void ensureLanguageLoaded(language).then(() => {
            if (alive) setAccentChars(accentsFor(language))
        })
        return () => { alive = false }
    }, [language])

    const practiceStats = api.practiceStats.get.useQuery({ pool }, { enabled: signedIn })
    const transitions = api.transitionStats.get.useQuery({ pool }, { enabled: signedIn })
    const timelines = api.test.getLatestTimelines.useQuery(
        { language, pool },
        { enabled: signedIn, retry: false },
    )
    const remote = api.coachingSession.getToday.useQuery(
        { dateKey, pool, language },
        { enabled: signedIn, retry: false },
    )
    const save = api.coachingSession.save.useMutation()

    const evidence = useMemo(() => {
        if (!accentChars) return null
        const rawAttempts = signedIn
            ? new Map((practiceStats.data ?? []).map((item) => [item.character, { attempts: item.total, correct: item.correct }]))
            : new Map((guest?.keyStats ?? []).map((item) => [item.key, { attempts: item.attempts, correct: item.correct }]))
        const attempts = new Map([...rawAttempts].filter(([key]) => isDrillableOn(key, layout, accentChars)))
        return {
            attempts,
            transitions: signedIn ? transitions.data ?? [] : guest?.transitions ?? [],
            timelines: signedIn ? timelines.data ?? [] : guest?.timelines ?? [],
        }
    }, [accentChars, guest, layout, practiceStats.data, signedIn, timelines.data, transitions.data])

    const analysis = useMemo(
        () => evidence ? analyzeTypingEvidence({ timelines: evidence.timelines, corpusWords: getWords(language) }) : null,
        [evidence, language],
    )

    const finding = useMemo(
        () => evidence
            ? drillFindingFromCandidate(analysis?.recommendation ?? null)
                ?? nextDrillFinding(evidence.transitions, evidence.attempts)
            : null,
        [analysis?.recommendation, evidence],
    )

    const evidenceLoading = authStatus === "loading" || !accentChars || (signedIn
        ? practiceStats.isLoading || transitions.isLoading || timelines.isLoading
        : guest === null || !guest.timelinesLoaded)
    const remoteLoading = signedIn && remote.isLoading

    useEffect(() => {
        if (evidenceLoading || remoteLoading || !evidence) return
        const context = { dateKey, pool, language }
        const local = readLocalDailySession(scope, context)
        // A guest session carries into the account that signs in on this browser
        // (the sign-up promise: local-first work survives account creation).
        const carried = signedIn && !local ? readLocalDailySession(GUEST_DAILY_SCOPE, context) : null
        if (carried) carriedGuestRef.current = true
        const server = parseDailySession(remote.data)
        const existing = preferDailySession(preferDailySession(local, carried), server)
        // ponytail: yesterday is read from this device's mirror only - a
        // cross-device cold check would need a getRecent server read.
        const yesterday = yesterdayOutcomeFrom(
            readLocalDailySession(scope, { ...context, dateKey: previousDateKey(dateKey) })
            ?? (signedIn ? readLocalDailySession(GUEST_DAILY_SCOPE, { ...context, dateKey: previousDateKey(dateKey) }) : null),
        )
        const next = existing ?? createDailySession({
            ...context,
            ...evidence,
            recommendation: analysis?.recommendation ?? null,
            yesterday,
        })
        if (!sameSession(local, next)) writeLocalDailySession(scope, next)
        setDailySession((current) => sameSession(current, next) ? current : next)
    }, [analysis?.recommendation, dateKey, evidence, evidenceLoading, language, pool, remote.data, remoteLoading, scope, signedIn])

    useEffect(() => {
        const syncFromStorage = () => {
            const next = readLocalDailySession(scope, { dateKey, pool, language })
            setDailySession((current) => sameSession(current, next) ? current : next)
        }
        window.addEventListener(DAILY_COACHING_UPDATED_EVENT, syncFromStorage)
        window.addEventListener("storage", syncFromStorage)
        return () => {
            window.removeEventListener(DAILY_COACHING_UPDATED_EVENT, syncFromStorage)
            window.removeEventListener("storage", syncFromStorage)
        }
    }, [dateKey, language, pool, scope])

    const lastSaved = useRef<string | null>(null)
    const saving = useRef(false)
    useEffect(() => {
        if (!signedIn || !dailySession || remoteLoading || saving.current) return
        // Only sessions with real work earn a server row - a prescription that
        // was merely rendered stays local (free-tier writes).
        if (completedSetCount(dailySession) === 0) return
        const fingerprint = JSON.stringify(dailySession)
        if (lastSaved.current === fingerprint) return
        if (JSON.stringify(parseDailySession(remote.data)) === fingerprint) {
            lastSaved.current = fingerprint
            return
        }
        saving.current = true
        save.mutate({ snapshot: dailySession }, {
            onSuccess: (merged) => {
                lastSaved.current = fingerprint
                if (carriedGuestRef.current) {
                    clearLocalDailySessions(GUEST_DAILY_SCOPE)
                    carriedGuestRef.current = false
                }
                // The server may return a more-complete copy merged from another
                // device - converge it into this one instead of discarding it.
                const parsed = parseDailySession(merged)
                const preferred = parsed ? preferDailySession(dailySession, parsed) : dailySession
                if (preferred && !sameSession(preferred, dailySession)) writeLocalDailySession(scope, preferred)
            },
            onSettled: () => { saving.current = false },
        })
        // `mutate` is stable in practice but not guaranteed by its object wrapper.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dailySession, remote.data, remoteLoading, scope, signedIn])

    const current = dailySession?.dateKey === dateKey && dailySession.pool === pool && dailySession.language === language
        ? dailySession
        : null
    return { session: current, loading: evidenceLoading || remoteLoading || !current, finding }
}

// Local-mirror-only read for the nav badge: no queries, no session creation.
// The always-mounted coach tab's full hook keeps the mirror fresh.
export function useDailySessionBadge(): "active" | "done" | null {
    const { data: auth } = useSession()
    const scope = auth?.user?.id ?? GUEST_DAILY_SCOPE
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const [badge, setBadge] = useState<"active" | "done" | null>(null)
    useEffect(() => {
        const read = () => {
            const session = readLocalDailySession(scope, { dateKey: localDateKey(), pool, language })
            setBadge(session ? (session.status === "completed" ? "done" : "active") : null)
        }
        read()
        window.addEventListener(DAILY_COACHING_UPDATED_EVENT, read)
        window.addEventListener("storage", read)
        return () => {
            window.removeEventListener(DAILY_COACHING_UPDATED_EVENT, read)
            window.removeEventListener("storage", read)
        }
    }, [language, pool, scope])
    return badge
}
