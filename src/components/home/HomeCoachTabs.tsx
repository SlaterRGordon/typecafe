import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"
import { MaterialNavIcon } from "~/components/navigation/MaterialNavIcon"
import { useDailyCoachingSession } from "~/hooks/useDailyCoachingSession"
import { currentDailyStep, stepGoalMet } from "~/lib/dailyCoaching"
import { nextDrillFinding } from "~/lib/drillProgress"
import { useGuestEvidence } from "~/hooks/useGuestEvidence"
import { useLanguage } from "~/hooks/useLanguage"
import { useLayout } from "~/hooks/useLayout"
import { isDrillableOn } from "~/lib/drillKeys"
import { statsPoolFor } from "~/lib/keyboardLayout"
import { accentsFor, ensureLanguageLoaded } from "~/components/typer/utils"
import { api } from "~/utils/api"

const NEXT_ACTION_DISMISS_KEY = "typecafe:nextActionDismissed"

type CoachTab = {
    key: "daily" | "drill"
    label: string
    eyebrow: string
    body: React.ReactNode
    href: string
    cta: string
    testId: string
    topClassName: string
    dismissLabel?: string
    onDismiss?: () => void
}

type HomeCoachTabsProps = {
    className?: string
    desktop?: boolean
    inline?: boolean
}

function CoachTabPanel({ leftClassName, tab }: { leftClassName: string, tab: CoachTab }) {
    return (
        <div
            data-testid={tab.testId}
            className={`group fixed ${leftClassName} ${tab.topClassName} z-[46] h-12 w-[6rem] text-base-content transition-all duration-150 ease-out hover:z-[48] hover:h-[8rem] hover:w-72 focus-within:z-[48] focus-within:h-[8rem] focus-within:w-72 motion-reduce:transition-none`}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-[5px] top-6 z-[47] h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-base-content/15 bg-base-200/95"
            />
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-base-content/15 bg-base-200/95 transition-colors duration-150 group-hover:shadow-lg group-focus-within:shadow-lg motion-reduce:transition-none">
                <Link
                    href={tab.href}
                    className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs font-semibold text-primary transition-opacity duration-100 group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary motion-reduce:transition-none"
                    aria-label={tab.eyebrow}
                    title={tab.eyebrow}
                >
                    {tab.label}
                </Link>
                <section
                    data-testid={`${tab.testId}-panel`}
                    className="invisible pointer-events-none absolute inset-0 p-3 text-base-content opacity-0 transition-opacity duration-150 ease-out group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100 motion-reduce:transition-none"
                    aria-label={tab.eyebrow}
                >
                    {tab.onDismiss &&
                        <button
                            type="button"
                            onClick={tab.onDismiss}
                            aria-label={tab.dismissLabel}
                            title={tab.dismissLabel}
                            className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-base-content/45 transition hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            <MaterialNavIcon name="close" className="flex" />
                        </button>
                    }
                    <p className="pr-7 font-mono text-xs font-bold uppercase text-primary">{tab.eyebrow}</p>
                    <p className="mt-1 text-sm text-base-content/75">{tab.body}</p>
                    <Link
                        href={tab.href}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        {tab.cta}
                    </Link>
                </section>
            </div>
        </div>
    )
}

function InlineCoachTab({ tab }: { tab: CoachTab }) {
    return (
        <section data-testid={`${tab.testId}-inline`} className="min-w-0 flex-1 rounded-lg border border-primary/30 bg-primary/10 p-4" aria-label={tab.eyebrow}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-mono text-xs font-bold uppercase text-primary">{tab.eyebrow}</p>
                    <p className="mt-1 text-sm text-base-content/75">{tab.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full border border-primary/30 px-2 py-1 text-xs font-semibold text-primary">{tab.label}</span>
                    {tab.onDismiss &&
                        <button
                            type="button"
                            onClick={tab.onDismiss}
                            aria-label={tab.dismissLabel}
                            title={tab.dismissLabel}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-base-content/45 transition hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            <MaterialNavIcon name="close" className="flex" />
                        </button>
                    }
                </div>
            </div>
            <Link
                href={tab.href}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                {tab.cta}
            </Link>
        </section>
    )
}

export function HomeCoachTabs({ className = "", desktop = true, inline = true }: HomeCoachTabsProps) {
    const router = useRouter()
    const { data: authSession, status: sessionStatus } = useSession()
    const signedIn = sessionStatus === "authenticated" && !!authSession?.user
    const [sideNavExpanded, setSideNavExpanded] = useState(false)
    const { session, loading } = useDailyCoachingSession()
    const [dismissedFinding, setDismissedFinding] = useState(() => {
        try { return localStorage.getItem(NEXT_ACTION_DISMISS_KEY); } catch { return null; }
    })

    useEffect(() => {
        const onSideNavExpanded = (event: Event) => {
            setSideNavExpanded(Boolean((event as CustomEvent<boolean>).detail))
        }
        window.addEventListener("typecafe:side-nav-expanded", onSideNavExpanded)
        return () => window.removeEventListener("typecafe:side-nav-expanded", onSideNavExpanded)
    }, [])

    // Coach evidence follows the active layout's stats pool (ledger decision 6).
    const [activeLayout] = useLayout()
    const pool = statsPoolFor(activeLayout)
    const transitionsQuery = api.transitionStats.get.useQuery({ pool }, { enabled: signedIn })
    const practiceStatsQuery = api.practiceStats.get.useQuery({ pool }, { enabled: signedIn })
    const guestEvidence = useGuestEvidence()
    // The active language's accents let a weak é surface - and keys from other
    // languages/layouts stay out of the suggestion.
    const [language] = useLanguage()
    const [accentChars, setAccentChars] = useState<string[]>([])
    useEffect(() => {
        let alive = true
        void ensureLanguageLoaded(language).then(() => { if (alive) setAccentChars(accentsFor(language)); })
        return () => { alive = false }
    }, [language])

    const tabs = useMemo<CoachTab[]>(() => {
        const nextTabs: CoachTab[] = []

        // A finished day clears the tab entirely - completing the session is
        // clearing the notification. The proof lives on /plan (Daily Coach nav entry).
        if (session && session.status !== "completed") {
            const active = currentDailyStep(session)
            const stepsDone = session.steps.filter(stepGoalMet).length

            nextTabs.push({
                key: "daily",
                label: `Today ${stepsDone}/${session.steps.length}`,
                eyebrow: "Today's coaching",
                body: <><span className="font-semibold text-base-content">{active?.title}</span> · about {session.estimatedMinutes} min.</>,
                href: active?.href ?? "/plan",
                cta: stepsDone > 0 || (active?.sets.length ?? 0) > 0 ? "Resume session" : "Start session",
                testId: "home-coach-tab-daily",
                // Aligned with the rail's "Daily Coach" nav entry - the flyout
                // is that entry's live detail.
                topClassName: "top-[16.5rem]",
            })
        }

        // The standing weak-spot drill: same finding priority for both sources,
        // signed-in reads the DB, guests read their local-first evidence
        // (ADR-0001). No history → no tab.
        const transitions = signedIn ? transitionsQuery.data ?? [] : guestEvidence?.transitions ?? []
        const rawAttempts = signedIn
            ? new Map((practiceStatsQuery.data ?? []).map((s) => [s.character, { attempts: s.total, correct: s.correct }]))
            : new Map((guestEvidence?.keyStats ?? []).map((s) => [s.key, { attempts: s.attempts, correct: s.correct }]))
        // Only suggest keys drillable on the current language/layout.
        const attempts = new Map([...rawAttempts].filter(([key]) => isDrillableOn(key, activeLayout, accentChars)))

        const finding = nextDrillFinding(transitions, attempts)
        if (finding && dismissedFinding !== finding.id) {
            const findingId = finding.id
            nextTabs.push({
                key: "drill",
                label: "Fix this",
                eyebrow: "Targeted drill",
                body: finding.kind === "transition"
                    ? <>Your slowest jump is <span className="font-mono font-bold text-base-content">{finding.from}-&gt;{finding.to}</span> ({finding.ratio.toFixed(1)}x avg).</>
                    : <>Your weakest keys are <span className="font-mono font-bold text-base-content">{finding.keys.join(" ")}</span>.</>,
                href: finding.href,
                cta: "Start drill",
                testId: "home-coach-tab-drill",
                // Aligned with the rail's "Train" nav entry.
                topClassName: "top-[8.5rem]",
                dismissLabel: "Dismiss drill suggestion",
                onDismiss: () => {
                    setDismissedFinding(findingId)
                    try { localStorage.setItem(NEXT_ACTION_DISMISS_KEY, findingId); } catch { /* localStorage unavailable */ }
                },
            })
        }

        return nextTabs
    }, [accentChars, activeLayout, dismissedFinding, guestEvidence, practiceStatsQuery.data, session, signedIn, transitionsQuery.data])

    if (loading || tabs.length === 0) return null

    const leftClassName = sideNavExpanded ? "left-64" : "left-[4.6rem]"
    const showInline = inline && router.pathname === "/"

    return (
        <>
            {desktop &&
                <div data-testid="home-coach-tabs" className={`${className} hidden md:block`}>
                    {tabs.map((tab) => <CoachTabPanel key={tab.key} leftClassName={leftClassName} tab={tab} />)}
                </div>
            }
            {showInline &&
                <div data-testid="home-coach-tabs-inline" className={`${className} mx-auto mb-3 flex w-full max-w-screen-xl gap-2 px-4 md:hidden`}>
                    {tabs.map((tab) => <InlineCoachTab key={tab.key} tab={tab} />)}
                </div>
            }
        </>
    )
}
