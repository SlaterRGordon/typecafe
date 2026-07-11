
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { HomeCoachTabs } from "../home/HomeCoachTabs";

const SignInModal = dynamic(
    () => import("../SignInModal").then((module) => module.SignInModal),
    { ssr: false },
);
const ColorModal = dynamic(
    () => import("../colors/ColorModal").then((module) => module.ColorModal),
    { ssr: false },
);
const UsernameModal = dynamic(
    () => import("../UsernameModal").then((module) => module.UsernameModal),
    { ssr: false },
);

export const Navigation = () => {
    const { data: session, status } = useSession();
    const [signInLoaded, setSignInLoaded] = useState(false);
    const [signInOpen, setSignInOpen] = useState(false);
    const [colorLoaded, setColorLoaded] = useState(false);
    const [colorOpen, setColorOpen] = useState(false);
    const needsUsername = status === "authenticated" && !!session?.user && !session.user.username;

    const openSignIn = () => {
        setSignInLoaded(true);
        setSignInOpen(true);
    };
    const openColors = () => {
        setColorLoaded(true);
        setColorOpen(true);
    };

    return (
        <>
            <TopNavigation onOpenSignIn={openSignIn} onOpenColors={openColors} />
            <SideNavigation />
            <HomeCoachTabs className="typing-focus-global-fade" inline={false} />
            <BottomNavigation />
            {signInLoaded && <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />}
            {colorLoaded && <ColorModal open={colorOpen} onClose={() => setColorOpen(false)} />}
            {needsUsername && <UsernameModal />}
        </>
    )
}
