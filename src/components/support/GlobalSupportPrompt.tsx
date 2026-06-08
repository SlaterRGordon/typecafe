import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { SupportCard } from "./SupportCard";

const SUPPORT_DISMISSED_STORAGE_KEY = "typecafe.supportDismissedAt";
const SUPPORT_PROMPT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

function shouldShowSupportPrompt(storedValue: string | null, now: number) {
    if (!storedValue) return true;

    const dismissedAt = Number(storedValue);
    if (!Number.isFinite(dismissedAt)) return true;

    return now - dismissedAt >= SUPPORT_PROMPT_INTERVAL_MS;
}

export const GlobalSupportPrompt = () => {
    const router = useRouter();
    const [showSupport, setShowSupport] = useState(false);

    useEffect(() => {
        if (router.pathname === "/support") {
            setShowSupport(false);
            return;
        }

        setShowSupport(shouldShowSupportPrompt(
            window.localStorage.getItem(SUPPORT_DISMISSED_STORAGE_KEY),
            Date.now(),
        ));
    }, [router.pathname]);

    const dismissSupportPrompt = () => {
        window.localStorage.setItem(SUPPORT_DISMISSED_STORAGE_KEY, Date.now().toString());
        setShowSupport(false);
    };

    if (!showSupport) return null;

    return (
        <div className="absolute right-0 bottom-0 m-4 invisible md:visible" data-testid="global-support-prompt">
            <SupportCard showDismiss={true} onDismiss={dismissSupportPrompt} />
        </div>
    );
};
