import Link from "next/link";

import { Chip } from "~/components/ui/Chip";
import { api } from "~/utils/api";
import type { RouterOutputs } from "~/utils/api";

export type ProfileTrainProgressSummary = RouterOutputs["trainProgress"]["getSummary"];

function formatPercent(value: number) {
    return `${Math.round(value)}%`;
}

function DifficultyRow(props: {
    label: string;
    levelsCompleted: number;
    totalLevels: number;
    starsEarned: number;
    totalStars: number;
    percentComplete: number;
}) {
    return (
        <div className="rounded-lg border border-base-content/10 bg-base-100/35 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-base-content/85">
                        <i className="fa-solid fa-layer-group w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{props.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-base-content/45">
                        {formatPercent(props.percentComplete)} complete
                    </div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-base-content/60">
                    <div>{props.levelsCompleted}/{props.totalLevels} levels</div>
                    <div>{props.starsEarned}/{props.totalStars} stars</div>
                </div>
            </div>
            <div
                className="mt-2 h-1.5 rounded-full bg-base-content/15"
                role="progressbar"
                aria-label={`${props.label} train progress`}
                aria-valuemin={0}
                aria-valuemax={props.totalLevels}
                aria-valuenow={props.levelsCompleted}
            >
                <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, props.percentComplete))}%` }}
                />
            </div>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="flex min-h-48 items-center justify-center" role="status" aria-live="polite">
            <div className="grid w-full gap-2 motion-safe:animate-pulse">
                {[0, 1, 2].map((row) => (
                    <div key={row} className="rounded-lg border border-base-content/10 bg-base-100/35 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                            <div className="space-y-2">
                                <div className="h-4 w-28 rounded-md bg-base-content/10" aria-hidden="true" />
                                <div className="h-3 w-20 rounded-md bg-base-content/10" aria-hidden="true" />
                            </div>
                            <div className="space-y-1">
                                <div className="ml-auto h-3 w-20 rounded-md bg-base-content/10" aria-hidden="true" />
                                <div className="ml-auto h-3 w-16 rounded-md bg-base-content/10" aria-hidden="true" />
                            </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-base-content/10" aria-hidden="true" />
                    </div>
                ))}
            </div>
            <span className="sr-only">Loading train progress...</span>
        </div>
    );
}

export function TrainProgressPanel(props: { userId?: string; data?: ProfileTrainProgressSummary }) {
    const { data: fetchedData, isLoading } = api.trainProgress.getSummary.useQuery(
        { userId: props.userId },
        { enabled: !props.data },
    );
    const data = props.data ?? fetchedData;

    return (
        <section
            className="flex h-full w-full flex-col gap-3 rounded-lg border border-base-content/10 bg-base-200/45 p-5"
            data-testid="profile-train-progress"
            aria-labelledby="profile-train-progress-heading"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 id="profile-train-progress-heading" className="text-base font-bold">Train progress</h2>
                </div>
                <Link
                    href="/train"
                    className="rounded-full transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label="Open Train"
                    data-testid="profile-train-link"
                >
                    <Chip
                        tone="primary"
                        size="sm"
                        icon={<i className="fa-solid fa-dumbbell" aria-hidden="true" />}
                    >
                        Train
                    </Chip>
                </Link>
            </div>

            {isLoading ?
                <LoadingState />
                :
                <>
                    <div className="grid gap-2">
                        {(data?.difficulties ?? []).map((difficulty) => (
                            <DifficultyRow
                                key={difficulty.difficulty}
                                label={difficulty.label}
                                levelsCompleted={difficulty.levelsCompleted}
                                totalLevels={difficulty.totalLevels}
                                starsEarned={difficulty.starsEarned}
                                totalStars={difficulty.totalStars}
                                percentComplete={difficulty.percentComplete}
                            />
                        ))}
                    </div>
                </>
            }
        </section>
    );
}
