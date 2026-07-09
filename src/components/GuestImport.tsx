import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { clearLocalKeyStats, readLocalKeyStats } from "~/lib/localSync";
import { clearLocalTransitions, readLocalTransitions } from "~/lib/localTransitions";
import { STATS_POOLS } from "~/lib/keyboardLayout";
import { clearLocalProgress, readLocalProgress } from "~/lib/progressHistory";
import { api } from "~/utils/api";

// On sign-in, import the guest's local-first evidence into the account: progress
// history, per-key practice stats, and transition stats. One mount point for all
// three (was split across this component, useTestPersistence, and — for
// transitions — nowhere, so guest transitions were lost on sign-in). Each family
// is guarded per-user and clears its localStorage mirror only on its own success.
export function GuestImport() {
    const { data: sessionData } = useSession();
    const userId = sessionData?.user?.id ?? null;
    const utils = api.useUtils();

    const progressForUserRef = useRef<string | null>(null);
    const keyStatsForUserRef = useRef<string | null>(null);
    const transitionsForUserRef = useRef<string | null>(null);

    const syncProgress = api.test.syncProgressHistory.useMutation({
        onSuccess: async (result) => {
            utils.test.getDailyProgressRollups.setData(undefined, result.rollups);
            clearLocalProgress();
            await utils.test.getDailyProgressRollups.invalidate();
        },
        onError: () => { progressForUserRef.current = null; },
    });
    const syncKeyStats = api.practiceStats.batchSync.useMutation({
        onSuccess: async (_data, variables) => {
            clearLocalKeyStats(variables.pool ?? "qwerty");
            await utils.practiceStats.get.invalidate();
        },
        onError: () => { keyStatsForUserRef.current = null; },
    });
    const syncTransitions = api.transitionStats.batchSync.useMutation({
        onSuccess: async (_data, variables) => {
            clearLocalTransitions(variables.pool ?? "qwerty");
            await utils.transitionStats.get.invalidate();
        },
        onError: () => { transitionsForUserRef.current = null; },
    });

    useEffect(() => {
        if (!userId) return;

        if (progressForUserRef.current !== userId) {
            const entries = readLocalProgress();
            if (entries.length > 0) {
                progressForUserRef.current = userId;
                // A guest who'd been typing locally just signed in — the conversion
                // moment. Local progress is cleared on import, so this fires once.
                window.gtag?.("event", "guest_signup", { tests: entries.length });
                syncProgress.mutate({ entries, utcOffsetMinutes: -new Date().getTimezoneOffset() });
            }
        }

        // Key stats and transitions import per stats pool (the guest mirrors are
        // pool-suffixed — docs/features/keyboard-layouts.md decision 6).
        if (keyStatsForUserRef.current !== userId) {
            keyStatsForUserRef.current = userId;
            for (const pool of STATS_POOLS) {
                const keyStats = readLocalKeyStats(pool);
                if (keyStats.length === 0) continue;
                syncKeyStats.mutate({
                    stats: keyStats.map((s) => ({ character: s.key, total: s.attempts, correct: s.correct })),
                    pool,
                });
            }
        }

        if (transitionsForUserRef.current !== userId) {
            transitionsForUserRef.current = userId;
            for (const pool of STATS_POOLS) {
                const transitions = readLocalTransitions(pool);
                if (transitions.length === 0) continue;
                syncTransitions.mutate({ stats: transitions, pool });
            }
        }
    }, [userId, syncProgress, syncKeyStats, syncTransitions]);

    return null;
}
