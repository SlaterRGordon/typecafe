import { useMemo, useState } from "react";
import { Avatar } from "~/components/Avatar";
import { Activity } from "~/components/profile/activity/Activity";
import { TrainProgressPanel } from "~/components/profile/trainProgress/TrainProgressPanel";
import { Stats, type ProfileStatsData } from "~/components/profile/stats/Stats";
import { TypingStylePanel } from "~/components/profile/typingStyle/TypingStylePanel";
import { formatPercentile } from "~/components/profile/stats/utils";
import { Chip } from "~/components/ui/Chip";
import { profileLinkSchema } from "~/lib/userProfile";
import { currentStreak } from "~/lib/progress";
import { netFromRaw } from "~/lib/stats";
import { api } from "~/utils/api";

type ProfileUser = {
    id: string;
    username: string | null;
    name?: string | null;
    image: string | null;
    bio: string | null;
    link: string | null;
} | null | undefined;

function formatProfileMetric(value: number, decimals = 1) {
    return value.toFixed(decimals).replace(/\.0$/, "");
}

function formatDelta(value: number) {
    return `${value >= 0 ? "+" : ""}${formatProfileMetric(value)} WPM this month`;
}

function SkeletonBlock(props: { className: string }) {
    return <div className={`rounded-md bg-base-content/10 ${props.className}`} aria-hidden="true" />;
}

export function ProfileLoadingSkeleton() {
    return (
        <div
            data-testid="profile-loading-skeleton"
            role="status"
            aria-busy="true"
            className="mx-auto flex h-full w-full max-w-screen-xl flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 lg:px-8"
        >
            <span className="sr-only">Loading profile...</span>
            <div className="flex w-full flex-col gap-4 motion-safe:animate-pulse">
                <section className="relative flex flex-col overflow-hidden rounded-lg lg:m-6 lg:flex-row lg:items-center lg:gap-4">
                    <div className="relative flex min-w-0 flex-col gap-4 lg:flex-1">
                        <div className="flex flex-row gap-4">
                            <SkeletonBlock className="h-[90px] w-[90px] shrink-0 rounded-full bg-primary/20" />
                            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                                <div className="flex items-center gap-2">
                                    <SkeletonBlock className="h-8 w-40" />
                                    <SkeletonBlock className="h-7 w-7 rounded-full" />
                                </div>
                                <SkeletonBlock className="h-5 w-full max-w-sm" />
                                <SkeletonBlock className="h-4 w-48" />
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-start gap-2">
                            <SkeletonBlock className="h-8 w-28 rounded-full" />
                            <SkeletonBlock className="h-8 w-44 rounded-full" />
                            <SkeletonBlock className="h-8 w-32 rounded-full" />
                        </div>
                    </div>
                    <div className="relative my-5 h-px w-full bg-gradient-to-r from-transparent via-base-content/20 to-transparent lg:my-0 lg:ml-8 lg:mr-8 lg:h-32 lg:w-px lg:self-stretch lg:bg-gradient-to-b" aria-hidden="true" />
                    <div className="relative flex flex-col items-center lg:min-w-[22rem] lg:items-start">
                        <SkeletonBlock className="h-5 w-36" />
                        <div className="mt-3 flex items-end gap-2">
                            <SkeletonBlock className="h-24 w-56 sm:h-32" />
                            <SkeletonBlock className="mb-2 h-10 w-20" />
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((item) => (
                        <div key={item} className="flex min-h-[7rem] items-center gap-4 rounded-lg border border-base-content/10 bg-base-200/45 px-5 py-4">
                            <SkeletonBlock className="h-14 w-14 shrink-0 rounded-full bg-base-content/15" />
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                                <SkeletonBlock className="h-10 w-28" />
                                <SkeletonBlock className="h-4 w-24" />
                            </div>
                        </div>
                    ))}
                </div>

                <section className="flex w-full flex-col gap-4 rounded-lg border border-base-content/10 bg-base-200/45 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <SkeletonBlock className="h-6 w-32" />
                        <SkeletonBlock className="h-6 w-44" />
                    </div>
                    <div className="grid grid-cols-12 gap-1">
                        {Array.from({ length: 84 }, (_, index) => (
                            <SkeletonBlock
                                key={index}
                                className={`h-5 rounded-sm ${index % 9 === 0 ? "bg-primary/25" : index % 5 === 0 ? "bg-base-content/15" : ""}`}
                            />
                        ))}
                    </div>
                    <SkeletonBlock className="h-4 w-48" />
                </section>

                <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
                    <div className="min-w-0 rounded-lg border border-base-content/10 bg-base-200/45 p-5">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <SkeletonBlock className="h-6 w-32" />
                            <SkeletonBlock className="h-8 w-24" />
                        </div>
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
                            <div className="space-y-3">
                                <SkeletonBlock className="h-12 w-full" />
                                <SkeletonBlock className="h-12 w-5/6" />
                                <SkeletonBlock className="h-12 w-4/5" />
                            </div>
                            <div className="relative h-36 overflow-hidden rounded-md border border-base-content/10 bg-base-100/30">
                                <SkeletonBlock className="absolute bottom-6 left-5 h-px w-32" />
                                <SkeletonBlock className="absolute bottom-6 left-5 h-24 w-px" />
                                <SkeletonBlock className="absolute left-8 top-20 h-2 w-2 rounded-full bg-primary/30" />
                                <SkeletonBlock className="absolute left-16 top-14 h-2 w-2 rounded-full bg-primary/30" />
                                <SkeletonBlock className="absolute left-28 top-8 h-2 w-2 rounded-full bg-primary/30" />
                                <SkeletonBlock className="absolute left-7 top-16 h-1 w-28 rotate-[-12deg] bg-primary/25" />
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0 rounded-lg border border-base-content/10 bg-base-200/45 p-5">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <SkeletonBlock className="h-6 w-36" />
                            <SkeletonBlock className="h-8 w-20" />
                        </div>
                        <div className="space-y-4">
                            <SkeletonBlock className="h-4 w-40" />
                            <SkeletonBlock className="h-3 w-full" />
                            <SkeletonBlock className="h-3 w-5/6" />
                            <div className="grid grid-cols-2 gap-3">
                                <SkeletonBlock className="h-16 w-full" />
                                <SkeletonBlock className="h-16 w-full" />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export function ProfileView(props: { user: ProfileUser; isLoading: boolean; editable?: boolean }) {
    const { user, isLoading, editable } = props;
    const userId = user?.id;
    const shouldLoadProfileData = !isLoading && !!userId;
    const parsedProfileLink = profileLinkSchema.safeParse(user?.link ?? "");
    const safeProfileLink = parsedProfileLink.success && parsedProfileLink.data !== "" ? parsedProfileLink.data : null;

    const streakRange = useState(() => ({
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
    }))[0];
    const { utcOffsetMinutes, ...activityRange } = streakRange;
    const [statsRange] = useState(() => ({
        startDate: new Date(new Date().getFullYear(), 0, 1),
        endDate: new Date(),
    }));
    const [calendarRange] = useState(() => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 365);
        return { startDate, endDate: new Date() };
    });

    const { data: activity, isLoading: isLoadingActivity } = api.test.getActivityByDate.useQuery(
        { ...activityRange, userId },
        { enabled: shouldLoadProfileData },
    );
    const streak = currentStreak(
        (activity ?? []).map((day) => ({
            wpm: 0,
            accuracy: 0,
            createdAt: day.summaryDate,
            day: day.summaryDate.toISOString().slice(0, 10),
        })),
        streakRange.endDate,
        utcOffsetMinutes,
    );

    const { data: best, isLoading: isLoadingBest } = api.test.getBestScore.useQuery({ userId }, { enabled: shouldLoadProfileData });
    const { data: percentile, isLoading: isLoadingPercentile } = api.test.getPercentile.useQuery({ userId }, { enabled: shouldLoadProfileData });
    const { data: proof, isLoading: isLoadingProof } = api.test.getProfileProof.useQuery({ userId }, { enabled: shouldLoadProfileData });
    const topWpm = best ? netFromRaw(best.speed, best.accuracy) : null;

    const { data: wordTypes, isLoading: isLoadingWordTypes } = api.type.getAll.useQuery({ subMode: 1 }, { enabled: shouldLoadProfileData });
    const wordTypeIds = useMemo(() => wordTypes?.map((type) => type.id) ?? [], [wordTypes]);
    const { data: wordsTyped, isLoading: isLoadingWordsTyped } = api.test.getTimeTyped.useQuery(
        { typeIds: wordTypeIds, userId },
        { enabled: shouldLoadProfileData && !!wordTypes },
    );

    const { data: timeTypes, isLoading: isLoadingTimeTypes } = api.type.getAll.useQuery({ subMode: 0 }, { enabled: shouldLoadProfileData });
    const timeTypeIds = useMemo(() => timeTypes?.map((type) => type.id) ?? [], [timeTypes]);
    const { data: timeTyped, isLoading: isLoadingTimeTyped } = api.test.getTimeTyped.useQuery(
        { typeIds: timeTypeIds, userId },
        { enabled: shouldLoadProfileData && !!timeTypes },
    );

    const { data: statsActivity, isLoading: isLoadingStatsActivity } = api.test.getActivityByDate.useQuery(
        { ...statsRange, userId },
        { enabled: shouldLoadProfileData },
    );
    const { data: calendarActivity, isLoading: isLoadingCalendarActivity } = api.test.getActivityByDate.useQuery(
        { ...calendarRange, userId },
        { enabled: shouldLoadProfileData },
    );
    const { data: trainProgress, isLoading: isLoadingTrainProgress } = api.trainProgress.getSummary.useQuery(
        { userId },
        { enabled: shouldLoadProfileData },
    );

    const statsData: ProfileStatsData | undefined = timeTyped && wordsTyped && statsActivity
        ? { timeTyped, wordsTyped, yearlyActivity: statsActivity }
        : undefined;
    const isProfileDataLoading = shouldLoadProfileData && (
        isLoadingActivity ||
        isLoadingBest ||
        isLoadingPercentile ||
        isLoadingProof ||
        isLoadingWordTypes ||
        isLoadingWordsTyped ||
        isLoadingTimeTypes ||
        isLoadingTimeTyped ||
        isLoadingStatsActivity ||
        isLoadingCalendarActivity ||
        isLoadingTrainProgress ||
        !statsData ||
        !calendarActivity ||
        !trainProgress
    );

    if (isLoading || isProfileDataLoading) return <ProfileLoadingSkeleton />;

    return (
        <div className="mx-auto flex h-full w-full max-w-screen-xl flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex w-full flex-col gap-4">
                <section className="relative flex flex-col overflow-hidden rounded-lg text-center lg:flex-row lg:items-center lg:gap-4 lg:m-6">
                    <div className="relative flex min-w-0 flex-col gap-4 lg:flex-1">
                        <div className="flex flex-row gap-4">
                            <div data-testid="profile-avatar">
                                <Avatar size={90} image={user?.image} name={user?.username ?? user?.name} />
                            </div>
                            <div className="flex max-w-full flex-col items-start justify-center gap-1 bg">
                                <div className="flex max-w-full items-center justify-center gap-2">
                                    <h1 className="truncate text-2xl font-bold leading-tight">{user?.username ?? ""}</h1>
                                    {editable &&
                                        <label htmlFor="configModal" data-testid="edit-profile" aria-label="Edit Profile" title="Edit Profile" className="btn btn-ghost btn-xs btn-circle shrink-0">
                                            <i className="fa-solid fa-pen text-sm" aria-hidden="true" />
                                            <span className="sr-only">Edit Profile</span>
                                        </label>
                                    }
                                </div>
                                {user?.bio &&
                                    <p className="flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-md text-base-content/60">
                                        {user?.bio && <span className="truncate">{user.bio}</span>}
                                    </p>
                                }
                                {safeProfileLink &&
                                    <a href={safeProfileLink} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full text-xs items-center gap-1.5 truncate text-primary hover:underline">
                                        <i className="fa-solid fa-link shrink-0" aria-hidden="true" />
                                        <span className="truncate">{safeProfileLink}</span>
                                    </a>
                                }
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-start gap-2">
                            {streak > 0 &&
                                <Chip
                                    testId="profile-streak"
                                    tone="primary"
                                    size="md"
                                    icon={<i className="fa-solid fa-fire" aria-hidden="true" />}
                                >
                                    {streak}-day streak
                                </Chip>
                            }
                            {typeof proof?.thirtyDayDelta === "number" &&
                                <Chip
                                    testId="profile-delta-chip"
                                    tone={proof.thirtyDayDelta >= 0 ? "success" : "error"}
                                    size="md"
                                    title="Net WPM progress from your available ranked tests."
                                    icon={<i className={`fa-solid ${proof.thirtyDayDelta >= 0 ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}`} aria-hidden="true" />}
                                >
                                    {formatDelta(proof.thirtyDayDelta)}
                                </Chip>
                            }
                            {percentile && percentile.total > 0 &&
                                <Chip
                                    size="md"
                                    icon={<i className="fa-solid fa-trophy text-primary" aria-hidden="true" />}
                                >
                                    {formatPercentile(percentile.percentile, percentile.better, percentile.worse)}
                                </Chip>
                            }
                        </div>
                    </div>
                    <div className="relative my-5 h-px w-full bg-gradient-to-r from-transparent via-base-content/20 to-transparent lg:my-0 lg:ml-8 lg:mr-8 lg:h-32 lg:w-px lg:self-stretch lg:bg-gradient-to-b" aria-hidden="true" />
                    <div className="relative flex flex-col items-center lg:min-w-[22rem] lg:items-start">
                        <span className="w-full text-center text-[1rem] font-bold uppercase tracking-[0.28em] text-base-content/35 lg:text-start">Top speed</span>
                        <div className="mt-1 flex items-baseline justify-center gap-2">
                            <span className="font-mono text-8xl font-bold leading-none text-primary sm:text-12xl">{topWpm != null ? topWpm.toFixed(1) : "-"}</span>
                            <span className="text-4xl font-semibold uppercase text-primary/80 sm:text-4xl">WPM</span>
                        </div>
                    </div>
                </section>

                <Stats profile={user ?? null} data={statsData} />

                <section className="flex w-full flex-col gap-2 rounded-lg border border-base-content/10 bg-base-200/45 p-5">
                    <Activity profile={user ?? null} data={calendarActivity} />
                </section>

                <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
                    <div className="min-w-0">
                        <TypingStylePanel proof={proof} />
                    </div>
                    <div className="min-w-0">
                        <TrainProgressPanel userId={userId} data={trainProgress} />
                    </div>
                </section>
            </div>
        </div>
    );
}
