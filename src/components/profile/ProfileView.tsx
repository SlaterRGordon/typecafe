import { useState } from "react";
import { Avatar } from "~/components/Avatar";
import { Activity } from "~/components/profile/activity/Activity";
import { TrainProgressPanel } from "~/components/profile/trainProgress/TrainProgressPanel";
import { Stats } from "~/components/profile/stats/Stats";
import { TypingStylePanel } from "~/components/profile/typingStyle/TypingStylePanel";
import { formatPercentile } from "~/components/profile/stats/utils";
import { Chip } from "~/components/ui/Chip";
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

export function ProfileView(props: { user: ProfileUser; isLoading: boolean; editable?: boolean }) {
    const { user, isLoading, editable } = props;
    const userId = user?.id;

    const streakRange = useState(() => ({
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
    }))[0];
    const { utcOffsetMinutes, ...activityRange } = streakRange;
    const { data: activity } = api.test.getActivityByDate.useQuery({ ...activityRange, userId });
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

    const { data: best } = api.test.getBestScore.useQuery({ userId });
    const { data: percentile } = api.test.getPercentile.useQuery({ userId });
    const { data: proof } = api.test.getProfileProof.useQuery({ userId });
    const topWpm = best ? netFromRaw(best.speed, best.accuracy) : null;

    return (
        <div className="mx-auto flex h-full w-full max-w-screen-xl flex-col items-center overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex w-full flex-col gap-4">
                <section className="relative flex flex-col overflow-hidden rounded-lg text-center lg:flex-row lg:items-center lg:gap-4 lg:m-6">
                    <div className="relative flex min-w-0 flex-col gap-4 lg:flex-1">
                        <div className="flex flex-row gap-4">
                            <div data-testid="profile-avatar">
                                <Avatar size={90} image={user?.image} name={user?.username ?? user?.name} />
                            </div>
                            {isLoading ?
                                <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary" />
                                :
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
                                    {user?.link &&
                                        <a href={user.link} className="inline-flex max-w-full text-xs items-center gap-1.5 truncate text-primary hover:underline">
                                            <i className="fa-solid fa-link shrink-0" aria-hidden="true" />
                                            <span className="truncate">{user.link}</span>
                                        </a>
                                    }
                                </div>
                            }
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

                <Stats profile={user ?? null} />

                <section className="flex w-full flex-col gap-2 rounded-lg border border-base-content/10 bg-base-200/45 p-5">
                    <Activity profile={user ?? null} />
                </section>

                <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
                    <div className="min-w-0">
                        <TypingStylePanel proof={proof} />
                    </div>
                    <div className="min-w-0">
                        <TrainProgressPanel userId={userId} />
                    </div>
                </section>
            </div>
        </div>
    );
}
