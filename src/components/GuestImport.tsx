import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { clearLocalKeyStats, readLocalKeyStats } from "~/lib/localSync";
import { clearLocalTransitions, readLocalTransitions } from "~/lib/localTransitions";
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
        onSuccess: async () => {
            clearLocalKeyStats();
            await utils.practiceStats.get.invalidate();
        },
        onError: () => { keyStatsForUserRef.current = null; },
    });
    const syncTransitions = api.transitionStats.batchSync.useMutation({
        onSuccess: async () => {
            clearLocalTransitions();
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
                syncProgress.mutate({ entries, utcOffsetMinutes: -new Date().getTimezoneOffset() });
            }
        }

        if (keyStatsForUserRef.current !== userId) {
            const keyStats = readLocalKeyStats();
            if (keyStats.length > 0) {
                keyStatsForUserRef.current = userId;
                syncKeyStats.mutate({
                    stats: keyStats.map((s) => ({ character: s.key, total: s.attempts, correct: s.correct })),
                });
            }
        }

        if (transitionsForUserRef.current !== userId) {
            const transitions = readLocalTransitions();
            if (transitions.length > 0) {
                transitionsForUserRef.current = userId;
                syncTransitions.mutate({ stats: transitions });
            }
        }
    }, [userId, syncProgress, syncKeyStats, syncTransitions]);

    return null;
}
