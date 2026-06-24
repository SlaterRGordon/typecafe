import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { clearLocalProgress, readLocalProgress } from "~/lib/progressHistory";
import { api } from "~/utils/api";

export function ProgressHistorySync() {
    const { data: sessionData } = useSession();
    const importingForUserRef = useRef<string | null>(null);
    const utils = api.useUtils();
    const syncProgressHistory = api.test.syncProgressHistory.useMutation({
        onSuccess: async (result) => {
            utils.test.getDailyProgressRollups.setData(undefined, result.rollups);
            clearLocalProgress();
            await utils.test.getDailyProgressRollups.invalidate();
        },
        onError: () => {
            importingForUserRef.current = null;
        },
    });

    useEffect(() => {
        const userId = sessionData?.user?.id;
        if (!userId) return;
        if (importingForUserRef.current === userId) return;

        const entries = readLocalProgress();
        if (entries.length === 0) return;

        importingForUserRef.current = userId;
        syncProgressHistory.mutate({
            entries,
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
        });
    }, [sessionData?.user?.id, syncProgressHistory]);

    return null;
}
