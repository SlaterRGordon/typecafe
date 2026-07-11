import { ScoreCard } from "~/components/scores/ScoreCard";
import { api } from "~/utils/api";

// The profile's signature personal bests as showcase cards (one per common
// config). Trophies, not a filterable log - Progress owns the dated PB
// milestones; this is the proud showcase slice.
export function SignatureBests(props: { userId?: string }) {
    const { data, isLoading } = api.test.getSignatureBests.useQuery({ userId: props.userId });

    if (isLoading) {
        return (
            <div className="flex min-h-[8rem] items-center justify-center" role="status" aria-live="polite">
                <div className="h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary"></div>
                <span className="sr-only">Loading best scores…</span>
            </div>
        );
    }

    return (
        <div data-testid="signature-bests" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(data ?? []).map((best) => (
                <ScoreCard
                    key={best.key}
                    eyebrow={best.eyebrow}
                    wpm={best.wpm}
                    accuracy={best.accuracy}
                    rawWpm={best.rawWpm}
                    date={best.createdAt}
                    emptyHint="Not set yet"
                />
            ))}
        </div>
    );
}
