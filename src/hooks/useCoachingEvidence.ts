import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { accentsFor, ensureLanguageLoaded, getWords } from "~/components/typer/utils"
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
    evidence: CoachingEvidence | null
    loading: boolean
    language: string
    pool: string
    scope: string
    signedIn: boolean
}

/** Read-only seam over current natural Test and Practice evidence. */
export function useCoachingEvidence(): CoachingEvidenceRead {
    const { data: auth, status: authStatus } = useSession()
    const signedIn = authStatus === "authenticated" && !!auth?.user
    const scope = signedIn ? auth.user.id : "guest"
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const guest = useGuestEvidence()
    const [accentChars, setAccentChars] = useState<string[] | null>(null)

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
        language: string
        value: SkillAnalysis
    } | null>(null)
    useEffect(() => {
        let active = true
        if (evidence) {
            void import("~/lib/skillEvidence").then(({ analyzeTypingEvidence }) => {
                if (!active) return
                setAnalysisState({
                    timelines: evidence.timelines,
                    language,
                    value: analyzeTypingEvidence({
                        timelines: evidence.timelines,
                        corpusWords: getWords(language),
                    }),
                })
            })
        }
        return () => { active = false }
    }, [evidence, language])
    const analysis = analysisState?.timelines === evidence?.timelines && analysisState?.language === language
        ? analysisState.value
        : null

    const loading = authStatus === "loading" || !accentChars || (signedIn
        ? practiceStats.isLoading || transitions.isLoading || timelines.isLoading
        : guest === null || !guest.timelinesLoaded) || (evidence !== null && analysis === null)

    return { analysis, evidence, loading, language, pool, scope, signedIn }
}
