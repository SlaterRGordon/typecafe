import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { worstTransitions } from "~/lib/transitions";
import { composeWeakKeys, worstKeysFromAttempts } from "~/lib/stats";
import { api } from "~/utils/api";

const DISMISS_KEY = "typecafe:nextActionDismissed";

// One coaching finding in the space the daily-challenge banner vacated: the
// user's single slowest transition (or, if none qualifies yet, their weakest
// keys), with a one-click drill. Signed-in only; guests/new users see nothing.
// Reuses the same query keys Progress already uses, so it's cached, not a new
// round-trip when the user has visited Progress this session.
//
// Dismissal is keyed to the finding itself: hiding "b→r" suppresses only that
// nudge, so the pill returns when the slowest jump actually changes — a new
// thing worth surfacing, never the same one nagging.
export function HomeNextAction() {
    const { data: session } = useSession();
    const signedIn = !!session?.user;
    const [dismissedFinding, setDismissedFinding] = useState(() => {
        try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
    });

    const transitionsQuery = api.transitionStats.get.useQuery(undefined, { enabled: signedIn });
    const practiceStatsQuery = api.practiceStats.get.useQuery(undefined, { enabled: signedIn });

    if (!signedIn) return null;

    const dismiss = (finding: string) => {
        setDismissedFinding(finding);
        try { localStorage.setItem(DISMISS_KEY, finding); } catch { /* localStorage unavailable */ }
    };

    const slowest = worstTransitions(transitionsQuery.data ?? [])[0];
    const weakKeys = slowest
        ? []
        : composeWeakKeys(
            worstKeysFromAttempts(
                new Map((practiceStatsQuery.data ?? []).map((s) => [s.character, { attempts: s.total, correct: s.correct }])),
                Infinity,
            ),
        ).slice(0, 4);

    let body: React.ReactNode;
    let drillKeys: string;
    if (slowest) {
        drillKeys = `${slowest.from},${slowest.to}`;
        body = <>Next: your slowest jump is <span className="font-mono font-bold text-base-content">{slowest.from}→{slowest.to}</span> ({slowest.ratio.toFixed(1)}× avg)</>;
    } else if (weakKeys.length > 0) {
        drillKeys = weakKeys.map((k) => k.key).join(",");
        body = <>Next: your weakest keys are <span className="font-mono font-bold text-base-content">{weakKeys.map((k) => k.key).join(" ")}</span></>;
    } else {
        return null;
    }

    if (dismissedFinding === drillKeys) return null;

    return (
        <div data-testid="home-next-action" className="mx-auto mb-3 flex w-full max-w-screen-xl justify-start">
            <div className="inline-flex items-center gap-3 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm">
                <span className="text-base-content/80">{body}</span>
                <Link href={`/drill?keys=${drillKeys}`} data-testid="home-next-action-drill" className="shrink-0 font-semibold text-primary hover:underline">
                    Drill it →
                </Link>
                <button type="button" onClick={() => dismiss(drillKeys)} aria-label="Dismiss" className="shrink-0 text-base-content/40 transition hover:text-base-content/70">
                    ✕
                </button>
            </div>
        </div>
    );
}
