import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { accentsFor, ensureLanguageLoaded, getWords } from "~/components/typer/utils"
import {
    DAILY_COACHING_UPDATED_EVENT,
    GUEST_DAILY_SCOPE,
    localDateKey,
    msUntilNextLocalDate,
    parseDailySession,
    preferDailySession,
    readLocalDailyHistory,
    readLocalDailySession,
    type DailyCoachingSession,
} from "~/lib/dailyCoaching"
import { isDrillableOn } from "~/lib/drillKeys"
import type { TimelineEvidence } from "~/lib/evidenceNormalization"
import { statsPoolFor } from "~/lib/keyboardLayout"
import type { SkillAnalysis } from "~/lib/skillEvidence"
import type { TransitionAggregate } from "~/lib/transitions"
import { api } from "~/utils/api"
import { useGuestEvidence } from "./useGuestEvidence"
import { useLanguage } from "./useLanguage"
import { useLayout } from "./useLayout"

export interface CoachingEvidence {
    attempts: Map<string, { attempts: number, correct: number }>
    transitions: TransitionAggregate[]
    timelines: TimelineEvidence[]
}

export interface CoachingEvidenceRead {
    analysis: SkillAnalysis | null
    currentSession: DailyCoachingSession | null
    evidence: CoachingEvidence | null
    history: DailyCoachingSession[]
    loading: boolean
    dateKey: string
    language: string
    pool: string
    scope: string
    signedIn: boolean
    remoteToday: DailyCoachingSession | null
    remoteTodayLoading: boolean
}

function mergeHistory(...groups: readonly (readonly DailyCoachingSession[])[]): DailyCoachingSession[] {
    const byId = new Map<string, DailyCoachingSession>()
    for (const session of groups.flat()) {
        const preferred = preferDailySession(byId.get(session.id) ?? null, session)
        if (preferred) byId.set(session.id, preferred)
    }
    return [...byId.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.updatedAt - a.updatedAt)
}

function sameHistory(a: readonly DailyCoachingSession[], b: readonly DailyCoachingSession[]): boolean {
    return a.length === b.length && a.every((session, index) =>
        session.id === b[index]?.id && session.updatedAt === b[index]?.updatedAt)
}

/**
 * Read-only seam over the local/server evidence mirrors. It may query and
 * derive, but never creates, freezes, writes, or saves a Coaching session.
 */
export function useCoachingEvidence(): CoachingEvidenceRead {
    const { data: auth, status: authStatus } = useSession()
    const signedIn = authStatus === "authenticated" && !!auth?.user
    const scope = signedIn ? auth.user.id : GUEST_DAILY_SCOPE
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const [dateKey, setDateKey] = useState(() => localDateKey())
    const guest = useGuestEvidence()
    const [accentChars, setAccentChars] = useState<string[] | null>(null)
    const [localHistory, setLocalHistory] = useState<DailyCoachingSession[]>([])

    useEffect(() => {
        const timeout = window.setTimeout(() => setDateKey(localDateKey()), msUntilNextLocalDate() + 1_000)
        return () => window.clearTimeout(timeout)
    }, [dateKey])

    useEffect(() => {
        const check = () => setDateKey((current) => {
            const next = localDateKey()
            return next === current ? current : next
        })
        window.addEventListener("focus", check)
        document.addEventListener("visibilitychange", check)
        return () => {
            window.removeEventListener("focus", check)
            document.removeEventListener("visibilitychange", check)
        }
    }, [])

    useEffect(() => {
        let active = true
        setAccentChars(null)
        void ensureLanguageLoaded(language).then(() => {
            if (active) setAccentChars(accentsFor(language))
        })
        return () => { active = false }
    }, [language])

    const practiceStats = api.practiceStats.get.useQuery({ pool }, { enabled: signedIn })
    const transitions = api.transitionStats.get.useQuery({ pool }, { enabled: signedIn })
    const timelines = api.test.getLatestTimelines.useQuery({ language, pool }, { enabled: signedIn, retry: false })
    const remoteToday = api.coachingSession.getToday.useQuery(
        { dateKey, pool, language },
        { enabled: signedIn, retry: false },
    )
    const remoteHistory = api.coachingSession.getHistory.useQuery(
        { pool, language },
        { enabled: signedIn, retry: false },
    )

    useEffect(() => {
        const read = () => {
            const next = mergeHistory(
                readLocalDailyHistory(scope, { pool, language }),
                signedIn ? readLocalDailyHistory(GUEST_DAILY_SCOPE, { pool, language }) : [],
            )
            setLocalHistory((current) => sameHistory(current, next) ? current : next)
        }
        read()
        window.addEventListener(DAILY_COACHING_UPDATED_EVENT, read)
        window.addEventListener("storage", read)
        return () => {
            window.removeEventListener(DAILY_COACHING_UPDATED_EVENT, read)
            window.removeEventListener("storage", read)
        }
    }, [language, pool, scope, signedIn])

    const localToday = useMemo(
        () => readLocalDailySession(scope, { dateKey, pool, language })
            ?? (signedIn ? readLocalDailySession(GUEST_DAILY_SCOPE, { dateKey, pool, language }) : null)
            ?? localHistory.find((session) => session.dateKey === dateKey && session.pool === pool && session.language === language)
            ?? null,
        [dateKey, language, localHistory, pool, scope, signedIn],
    )
    const parsedRemoteToday = useMemo(() => parseDailySession(remoteToday.data), [remoteToday.data])
    const currentSession = useMemo(
        () => preferDailySession(localToday, parsedRemoteToday),
        [localToday, parsedRemoteToday],
    )

    const history = useMemo(
        // getToday and getHistory are independently cached. Include the live
        // snapshot explicitly so a just-completed Target cannot disappear from
        // Mastery while the bounded history query is still catching up.
        () => mergeHistory(localHistory, remoteHistory.data ?? [], currentSession ? [currentSession] : []),
        [currentSession, localHistory, remoteHistory.data],
    )

    const evidence = useMemo<CoachingEvidence | null>(() => {
        if (!accentChars) return null
        const rawAttempts = signedIn
            ? new Map((practiceStats.data ?? []).map((item) => [item.character, { attempts: item.total, correct: item.correct }]))
            : new Map((guest?.keyStats ?? []).map((item) => [item.key, { attempts: item.attempts, correct: item.correct }]))
        return {
            attempts: new Map([...rawAttempts].filter(([key]) => isDrillableOn(key, layout, accentChars))),
            transitions: signedIn ? transitions.data ?? [] : guest?.transitions ?? [],
            timelines: signedIn ? timelines.data ?? [] : guest?.timelines ?? [],
        }
    }, [accentChars, guest, layout, practiceStats.data, signedIn, timelines.data, transitions.data])

    const [analysisState, setAnalysisState] = useState<{
        timelines: unknown
        sessions: unknown
        language: string
        dateKey: string
        value: SkillAnalysis
    } | null>(null)
    useEffect(() => {
        let active = true
        if (evidence) {
            void import("~/lib/skillEvidence").then(({ analyzeTypingEvidence }) => {
                if (!active) return
                setAnalysisState({
                    timelines: evidence.timelines,
                    sessions: history,
                    language,
                    dateKey,
                    value: analyzeTypingEvidence({
                        timelines: evidence.timelines,
                        corpusWords: getWords(language),
                        sessions: history,
                        todayDateKey: dateKey,
                        scope: { language, pool },
                    }),
                })
            })
        }
        return () => { active = false }
    }, [dateKey, evidence, history, language, pool])
    const analysis = analysisState?.timelines === evidence?.timelines && analysisState?.sessions === history &&
        analysisState?.language === language && analysisState?.dateKey === dateKey
        ? analysisState.value
        : null

    const loading = authStatus === "loading" || !accentChars || (signedIn
        ? practiceStats.isLoading || transitions.isLoading || timelines.isLoading || remoteHistory.isLoading || remoteToday.isLoading
        : guest === null || !guest.timelinesLoaded) || (evidence !== null && analysis === null)

    return {
        analysis,
        currentSession,
        evidence,
        history,
        loading,
        dateKey,
        language,
        pool,
        scope,
        signedIn,
        remoteToday: parsedRemoteToday,
        remoteTodayLoading: signedIn && remoteToday.isLoading,
    }
}
