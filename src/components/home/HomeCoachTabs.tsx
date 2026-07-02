import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { MaterialNavIcon } from "~/components/navigation/MaterialNavIcon";
import { challengeDateKey } from "~/lib/challenge";
import { localChallengeStatus, readLocalChallengeHistory, type ChallengeStatus } from "~/lib/challengeHistory";
import { composeWeakKeys, worstKeysFromAttempts } from "~/lib/stats";
import { worstTransitions } from "~/lib/transitions";
import { api } from "~/utils/api";

const NEXT_ACTION_DISMISS_KEY = "typecafe:nextActionDismissed";

type ChallengeStatusEntry = NonNullable<ChallengeStatus["today"]> & { delta?: number | null };

type CoachTab = {
    key: "drill" | "challenge";
    label: string;
    eyebrow: string;
    body: React.ReactNode;
    href: string;
    cta: string;
    testId: string;
    topClassName: string;
    dismissLabel?: string;
    onDismiss?: () => void;
};

type HomeCoachTabsProps = {
    className?: string;
    desktop?: boolean;
    inline?: boolean;
};

function formatNumber(value: number, digits = 1) {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function statusFromLocal(dateKey: string): ChallengeStatus {
    return localChallengeStatus(dateKey, readLocalChallengeHistory());
}

function CoachTabPanel({ leftClassName, tab }: { leftClassName: string; tab: CoachTab }) {
    return (
        <div
            data-testid={tab.testId}
            className={`group fixed ${leftClassName} ${tab.topClassName} z-[46] h-12 w-[5rem] text-base-content transition-all duration-150 ease-out hover:z-[48] hover:h-[7.15rem] hover:w-72 focus-within:z-[48] focus-within:h-[7.15rem] focus-within:w-72 motion-reduce:transition-none`}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-[5px] top-6 z-[47] h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-base-content/15 bg-base-200/95 transition-colors duration-150 group-hover:border-base-content/15 group-focus-within:border-base-content/15 motion-reduce:transition-none"
            />
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-base-content/15 bg-base-200/95 transition-colors duration-150 group-hover:border-base-content/15 group-hover:shadow-base-300/20 group-focus-within:border-base-content/15 group-focus-within:shadow-base-300/20 motion-reduce:transition-none">
                <Link
                    href={tab.href}
                    className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary transition-opacity duration-100 group-hover:pointer-events-none group-hover:opacity-0 group-focus-within:pointer-events-none group-focus-within:opacity-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary motion-reduce:transition-none"
                    aria-label={tab.eyebrow}
                    title={tab.eyebrow}
                >
                    <span>{tab.label}</span>
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
                        className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        {tab.cta}
                    </Link>
                </section>
            </div>
        </div>
    );
}

function InlineCoachTab({ tab }: { tab: CoachTab }) {
    return (
        <div data-testid={`${tab.testId}-inline`} className="min-w-0 flex-1 rounded-lg border border-base-content/10 bg-base-200/60 p-3">
            <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-primary">{tab.label}</p>
                {tab.onDismiss &&
                    <button
                        type="button"
                        onClick={tab.onDismiss}
                        aria-label={tab.dismissLabel}
                        title={tab.dismissLabel}
                        className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-base-content/45 transition hover:bg-base-content/10 hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        <MaterialNavIcon name="close" className="flex" />
                    </button>
                }
            </div>
            <p className="mt-1 overflow-hidden text-xs text-base-content/65">{tab.body}</p>
            <Link
                href={tab.href}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                {tab.cta}
            </Link>
        </div>
    );
}

export function HomeCoachTabs({ className = "", desktop = true, inline = true }: HomeCoachTabsProps) {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const signedIn = sessionStatus === "authenticated" && !!session?.user;
    const [sideNavExpanded, setSideNavExpanded] = useState(false);
    const [dismissedFinding, setDismissedFinding] = useState(() => {
        try { return localStorage.getItem(NEXT_ACTION_DISMISS_KEY); } catch { return null; }
    });
    const [dateKey, setDateKey] = useState<string | null>(null);
    const [localChallenge, setLocalChallenge] = useState<ChallengeStatus | null>(null);
    const [challengeDismissed, setChallengeDismissed] = useState(false);

    useEffect(() => {
        setDateKey(challengeDateKey(new Date(), -new Date().getTimezoneOffset()));
    }, []);

    useEffect(() => {
        const onSideNavExpanded = (event: Event) => {
            setSideNavExpanded(Boolean((event as CustomEvent<boolean>).detail));
        };
        window.addEventListener("typecafe:side-nav-expanded", onSideNavExpanded);
        return () => window.removeEventListener("typecafe:side-nav-expanded", onSideNavExpanded);
    }, []);

    useEffect(() => {
        if (!dateKey) return;
        try {
            setChallengeDismissed(sessionStorage.getItem(`typecafe:challengeCardDismissed:${dateKey}`) === "1");
        } catch { /* sessionStorage unavailable */ }
    }, [dateKey]);

    useEffect(() => {
        if (!dateKey || sessionStatus !== "unauthenticated") return;
        setLocalChallenge(statusFromLocal(dateKey));
    }, [dateKey, sessionStatus]);

    const transitionsQuery = api.transitionStats.get.useQuery(undefined, { enabled: signedIn });
    const practiceStatsQuery = api.practiceStats.get.useQuery(undefined, { enabled: signedIn });
    const remoteChallenge = api.test.getDailyChallengeStatus.useQuery(
        { dateKey: dateKey ?? "1970-01-01" },
        { enabled: !!dateKey && signedIn },
    );

    const tabs = useMemo(() => {
        const nextTabs: CoachTab[] = [];

        if (signedIn) {
            const slowest = worstTransitions(transitionsQuery.data ?? [])[0];
            const weakKeys = slowest
                ? []
                : composeWeakKeys(
                    worstKeysFromAttempts(
                        new Map((practiceStatsQuery.data ?? []).map((s) => [s.character, { attempts: s.total, correct: s.correct }])),
                        Infinity,
                    ),
                ).slice(0, 4);

            let drillHref: string | null = null;
            let findingId: string | null = null;
            let drillBody: React.ReactNode = null;
            if (slowest) {
                findingId = `transition:${slowest.pair}`;
                drillHref = `/drill?transitions=${slowest.pair}`;
                drillBody = <>Your slowest jump is <span className="font-mono font-bold text-base-content">{slowest.from}-&gt;{slowest.to}</span> ({slowest.ratio.toFixed(1)}x avg).</>;
            } else if (weakKeys.length > 0) {
                const keys = weakKeys.map((k) => k.key).join(",");
                findingId = `keys:${keys}`;
                drillHref = `/drill?keys=${keys}`;
                drillBody = <>Your weakest keys are <span className="font-mono font-bold text-base-content">{weakKeys.map((k) => k.key).join(" ")}</span>.</>;
            }

            if (drillHref && findingId && dismissedFinding !== findingId) {
                nextTabs.push({
                    key: "drill",
                    label: "Fix this",
                    eyebrow: "Targeted drill",
                    body: drillBody,
                    href: drillHref,
                    cta: "Start drill",
                    testId: "home-coach-tab-drill",
                    topClassName: "top-[12.5rem]",
                    dismissLabel: "Dismiss drill suggestion",
                    onDismiss: () => {
                        setDismissedFinding(findingId);
                        try { localStorage.setItem(NEXT_ACTION_DISMISS_KEY, findingId); } catch { /* localStorage unavailable */ }
                    },
                });
            }
        }

        const challengeStatusLoaded = signedIn ? remoteChallenge.data !== undefined : sessionStatus === "unauthenticated" && localChallenge !== null;
        const challengeStatus = signedIn ? remoteChallenge.data : localChallenge;
        const today = challengeStatus?.today as ChallengeStatusEntry | null | undefined;
        const streak = challengeStatus?.streak ?? 0;
        if (dateKey && challengeStatusLoaded && !today && !challengeDismissed) {
            nextTabs.push({
                key: "challenge",
                label: "Try now",
                eyebrow: "Daily challenge",
                body: <>Today&apos;s 30s challenge is ready{streak > 0 ? <>. {formatNumber(streak, 0)}-day streak on the line.</> : "."}</>,
                href: "/challenge",
                cta: "Start challenge",
                testId: "home-coach-tab-challenge",
                topClassName: "top-[16.5rem]",
                dismissLabel: "Dismiss daily challenge",
                onDismiss: () => {
                    setChallengeDismissed(true);
                    try { sessionStorage.setItem(`typecafe:challengeCardDismissed:${dateKey}`, "1"); } catch { /* sessionStorage unavailable */ }
                },
            });
        }

        return nextTabs;
    }, [challengeDismissed, dateKey, dismissedFinding, localChallenge, practiceStatsQuery.data, remoteChallenge.data, sessionStatus, signedIn, transitionsQuery.data]);

    if (tabs.length === 0) return null;

    const leftClassName = sideNavExpanded ? "left-64" : "left-[4.6rem]";
    const showInline = inline && router.pathname === "/";

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
    );
}
