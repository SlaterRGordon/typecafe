import { useState } from "react";
import { Avatar } from "~/components/Avatar";
import { Activity } from "~/components/profile/activity/Activity";
import { Stats } from "~/components/profile/stats/Stats";
import { formatPercentile } from "~/components/profile/stats/utils";
import { SignatureBests } from "~/components/scores/SignatureBests";
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

// The shared profile body for both own (/profile) and public
// (/profile/[username]) pages — one identity card, so the public view and your
// own look the same. Own adds only the pencil affordance (editable); the edit
// modal itself lives on the own page next to this view.
export function ProfileView(props: { user: ProfileUser; isLoading: boolean; editable?: boolean }) {
    const { user, isLoading, editable } = props;
    const userId = user?.id;

    // Practice-day streak from the last ~90 days (§3.2). Range memoized so the
    // query key stays stable across renders.
    const streakRange = useState(() => ({
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
    }))[0];
    const { data: activity } = api.test.getActivityByDate.useQuery({ ...streakRange, userId });
    const streak = currentStreak(
        (activity ?? []).map((day) => ({ wpm: 0, accuracy: 0, createdAt: day.summaryDate })),
        streakRange.endDate,
    );

    const { data: best } = api.test.getBestScore.useQuery({ userId });
    const { data: percentile } = api.test.getPercentile.useQuery({ userId });
    // Net WPM is the canonical "WPM" everywhere; the hero shows it, not raw.
    const topWpm = best ? netFromRaw(best.speed, best.accuracy) : null;

    return (
        <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-8 px-4 py-8">
            {/* Identity header + top-speed hero */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <div data-testid="profile-avatar">
                        <Avatar size={96} image={user?.image} name={user?.username ?? user?.name} />
                    </div>
                    {isLoading ?
                        <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary" />
                        :
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold">{user?.username ?? ""}</h1>
                                {streak > 0 &&
                                    <span data-testid="profile-streak" className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">{streak}-day streak</span>
                                }
                                {editable &&
                                    <label htmlFor="configModal" data-testid="edit-profile" aria-label="Edit Profile" title="Edit Profile" className="btn btn-ghost btn-xs btn-circle">
                                        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></svg>
                                    </label>
                                }
                            </div>
                            {user?.bio && <p className="text-sm text-base-content/70">{user.bio}</p>}
                            {user?.link && <a href={user.link} className="cursor-pointer text-sm text-primary hover:underline">{user.link}</a>}
                        </div>
                    }
                </div>

                <div className="flex items-end gap-4">
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-base-content/50">Top Speed</span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-5xl font-bold leading-none text-primary">{topWpm != null ? topWpm.toFixed(1) : "—"}</span>
                            <span className="text-sm text-base-content/50">wpm</span>
                        </div>
                    </div>
                    {percentile && percentile.total > 0 &&
                        <span className="rounded-full bg-base-200 px-3 py-1 text-sm font-semibold text-base-content/80">
                            {formatPercentile(percentile.percentile, percentile.better, percentile.worse)}
                        </span>
                    }
                </div>
            </div>

            <Stats profile={user ?? null} />

            <div className="hidden flex-col gap-2 md:flex">
                <h2 className="text-lg font-bold">Activity</h2>
                <Activity profile={user ?? null} />
            </div>

            <div className="flex flex-col gap-3">
                <h2 className="text-lg font-bold">Best Scores</h2>
                <SignatureBests userId={userId} />
            </div>
        </div>
    );
}
