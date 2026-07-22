import { useSession } from "next-auth/react";
import { useGuestEvidence } from "~/hooks/useGuestEvidence";

// Vision §5: a zero-history visitor must be able to tell TypeCafe from a
// minimal test clone before the first keystroke. One line of promise copy,
// gone as soon as any local evidence (or an account) exists.
export function FirstVisitPromise() {
    const { status } = useSession();
    const evidence = useGuestEvidence();
    if (status !== "unauthenticated" || !evidence) return null;
    const hasHistory =
        evidence.progress.length > 0 ||
        evidence.keyStats.length > 0 ||
        evidence.transitions.length > 0;
    if (hasHistory) return null;
    return (
        <p
            data-testid="first-visit-promise"
            className="text-center text-sm text-base-content/70"
        >
            Not just a typing test - finish one to see{" "}
            <span className="font-semibold text-primary">what&apos;s slowing you down</span>, and the
            drill that fixes it.
        </p>
    );
}
