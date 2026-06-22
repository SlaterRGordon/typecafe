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

export function DailyChallengePrompt(props: { className?: string; compact?: boolean; refreshSignal?: number }) {
    const { data: session } = useSession()
    const [dateKey, setDateKey] = useState<string | null>(null)
    const [localStatus, setLocalStatus] = useState<ChallengeStatus | null>(null)

    useEffect(() => {
        setDateKey(challengeDateKey(new Date(), -new Date().getTimezoneOffset()))
    }, [])

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
                <Link
                    href="/challenge"
                    className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                    {completed ? "Try again" : "Start challenge"}
                </Link>
            </div>
        </section>
    )
}
