import Link from "next/link";
import { Avatar } from "~/components/Avatar";

// A portable score tile: a hero WPM with optional secondary stats, a rank badge,
// and a user identity. Purely presentational - it takes already-computed numbers
// (net WPM, accuracy, …), no queries - so the same card serves profile signature
// bests, leaderboard rows, and the daily-challenge boards. Pass only the props a
// surface needs; everything but `wpm` is optional.
export interface ScoreCardProps {
    // Net WPM, the hero number. null renders the empty/unset state.
    wpm: number | null;
    // Small label above the hero, e.g. "15 seconds" or "Fastest today".
    eyebrow?: string;
    accuracy?: number | null;
    rawWpm?: number | null;
    date?: Date | null;
    // Optional rank badge (#1) and identity row for leaderboard-style use.
    rank?: number;
    user?: { username?: string | null; name?: string | null; image?: string | null };
    // Shown in place of the hero when wpm is null.
    emptyHint?: string;
    // Wraps the card in a link when set.
    href?: string;
    className?: string;
}

function SecondaryStat(props: { label: string; value: string }) {
    return (
        <div className="flex flex-col">
            <span className="font-mono text-sm font-semibold text-base-content/80">{props.value}</span>
            <span className="text-[0.65rem] uppercase tracking-wide text-base-content/40">{props.label}</span>
        </div>
    );
}

export function ScoreCard(props: ScoreCardProps) {
    const empty = props.wpm == null;
    const hasSecondary = props.accuracy != null || props.rawWpm != null || !!props.date;

    const card = (
        <div
            data-testid="score-card"
            className={`flex h-full flex-col gap-3 rounded-xl border border-base-content/10 bg-base-200/40 p-4 ${props.href ? "transition-colors hover:border-primary/40 hover:bg-base-200/70" : ""} ${props.className ?? ""}`}
        >
            {(props.eyebrow || props.rank != null) &&
                <div className="flex items-center justify-between gap-2">
                    {props.eyebrow && <span className="text-xs font-semibold uppercase tracking-wide text-base-content/50">{props.eyebrow}</span>}
                    {props.rank != null && <span className="font-mono text-sm font-bold text-base-content/40">#{props.rank}</span>}
                </div>
            }
            {props.user &&
                <div className="flex min-w-0 items-center gap-2">
                    <Avatar size={28} image={props.user.image} name={props.user.username ?? props.user.name} />
                    <span className="truncate text-sm font-semibold text-base-content">{props.user.username ?? props.user.name ?? "Anonymous"}</span>
                </div>
            }
            {empty ?
                <div className="flex flex-1 items-end">
                    <span className="text-sm text-base-content/45">{props.emptyHint ?? "No score yet"}</span>
                </div>
                :
                <>
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-4xl font-bold leading-none text-primary">{props.wpm!.toFixed(1)}</span>
                        <span className="text-sm font-medium text-base-content/50">wpm</span>
                    </div>
                    {hasSecondary &&
                        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-1">
                            {props.accuracy != null && <SecondaryStat label="acc" value={`${props.accuracy.toFixed(1)}%`} />}
                            {props.rawWpm != null && <SecondaryStat label="raw" value={props.rawWpm.toFixed(1)} />}
                            {props.date && <SecondaryStat label="date" value={props.date.toLocaleDateString()} />}
                        </div>
                    }
                </>
            }
        </div>
    );

    return props.href ? <Link href={props.href} className="block h-full">{card}</Link> : card;
}
