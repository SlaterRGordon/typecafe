import Link from "next/link"
import { useSession } from "next-auth/react"
import { useEffect, useMemo, useState } from "react"
import { challengeDateKey } from "~/lib/challenge"
import { localChallengeStatus, readLocalChallengeHistory, type ChallengeStatus } from "~/lib/challengeHistory"
import { api } from "~/utils/api"

type ChallengeStatusEntry = NonNullable<ChallengeStatus["today"]> & { delta?: number | null }

function formatNumber(value: number, digits = 1) {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    })
}

function statusFromLocal(dateKey: string): ChallengeStatus {
    return localChallengeStatus(dateKey, readLocalChallengeHistory())
}

type DailyChallengePromptProps = {
    className?: string;
    compact?: boolean;
    // Corner variant: a small fixed bottom-right card shown only while today's
    // challenge is undone, dismissible for the session. Used on the home page so
    // the prompt stays out of the typing column.
    corner?: boolean;
    refreshSignal?: number;
    completedCtaLabel?: string;
    onCompletedCta?: () => void;
};

export function DailyChallengePrompt(props: DailyChallengePromptProps) {
    const { data: session } = useSession()
    const [dateKey, setDateKey] = useState<string | null>(null)
    const [localStatus, setLocalStatus] = useState<ChallengeStatus | null>(null)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        setDateKey(challengeDateKey(new Date(), -new Date().getTimezoneOffset()))
    }, [])

    // The corner card stays dismissed for the session, per day.
    useEffect(() => {
        if (!props.corner || !dateKey) return
        try {
            setDismissed(sessionStorage.getItem(`typecafe:challengeCardDismissed:${dateKey}`) === "1")
        } catch { /* sessionStorage unavailable — card just won't remember dismissal */ }
    }, [props.corner, dateKey])

    const dismiss = () => {
        setDismissed(true)
        try { if (dateKey) sessionStorage.setItem(`typecafe:challengeCardDismissed:${dateKey}`, "1") } catch { /* ignore */ }
    }

    useEffect(() => {
        if (!dateKey || session?.user) return
        setLocalStatus(statusFromLocal(dateKey))
    }, [dateKey, props.refreshSignal, session?.user])

    const remoteStatus = api.test.getDailyChallengeStatus.useQuery(
        { dateKey: dateKey ?? "1970-01-01" },
        { enabled: !!dateKey && !!session?.user },
    )

    const status = useMemo(() => {
        if (session?.user) return remoteStatus.data ?? null
        return localStatus
    }, [localStatus, remoteStatus.data, session?.user])

    if (!dateKey) return null

    const today = status?.today as ChallengeStatusEntry | null | undefined
    const yesterday = status?.yesterday
    const streak = status?.streak ?? 0
    const completed = !!today
    const delta = typeof today?.delta === "number" ? today.delta : null
    const ctaClassName = "inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    const ctaLabel = completed ? (props.completedCtaLabel ?? "Try again") : "Start challenge"

    // Corner variant: only while undone, and collapses to nothing once done or
    // dismissed. Fixed bottom-right, out of the typing column.
    if (props.corner) {
        if (completed || dismissed) return null
        return (
            <section
                data-testid="daily-challenge-prompt"
                className={`${props.className ?? ""} fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-primary/35 bg-base-200/95 px-4 py-3 text-base-content shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur`}
                aria-label="Daily challenge"
            >
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss daily challenge"
                    title="Dismiss"
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-base-content/45 transition hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                </button>
                <div className="flex flex-wrap items-center gap-2 pr-6">
                    <p className="font-mono text-sm font-bold text-primary">Daily Challenge</p>
                    {streak > 0 &&
                        <span data-testid="challenge-streak" className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                            {streak}-day streak
                        </span>
                    }
                </div>
                <p className="mt-1 text-sm text-base-content/70">Today&apos;s 30s challenge is ready.</p>
                <Link href="/challenge" className={`${ctaClassName} mt-3 w-full`}>
                    Start challenge
                </Link>
            </section>
        )
    }

    return (
        <section
            data-testid="daily-challenge-prompt"
            className={`${props.className ?? ""} rounded-lg border border-primary/35 bg-primary/10 px-4 py-3 text-base-content`}
            aria-label="Daily challenge"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-bold text-primary">Daily Challenge</p>
                        {streak > 0 &&
                            <span data-testid="challenge-streak" className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                {streak}-day streak
                            </span>
                        }
                    </div>
                    {completed ?
                        <>
                            <p className="mt-1 text-sm font-semibold text-base-content">
                                Today complete: {formatNumber(today.wpm)} WPM
                                {delta !== null &&
                                    <span className={delta >= 0 ? "text-success" : "text-error"}>
                                        {" "}({delta >= 0 ? "+" : ""}{formatNumber(delta)} vs avg)
                                    </span>
                                }
                            </p>
                            {!props.compact && yesterday &&
                                <p className="mt-1 text-xs text-base-content/60">
                                    Yesterday: {formatNumber(yesterday.wpm)} WPM
                                </p>
                            }
                        </>
                        :
                        <>
                            <p className="mt-1 text-sm font-semibold text-base-content">Today&apos;s 30s challenge is ready.</p>
                            {!props.compact &&
                                <p className="mt-1 text-xs text-base-content/60">
                                    Same text for everyone. Beat your average, not just the room.
                                    {yesterday ? ` Yesterday: ${formatNumber(yesterday.wpm)} WPM.` : ""}
                                </p>
                            }
                        </>
                    }
                </div>
                {completed && props.onCompletedCta ?
                    <button
                        type="button"
                        className={ctaClassName}
                        onClick={props.onCompletedCta}
                    >
                        {ctaLabel}
                    </button>
                    :
                    <Link
                        href="/challenge"
                        className={ctaClassName}
                    >
                        {ctaLabel}
                    </Link>
                }
            </div>
        </section>
    )
}
