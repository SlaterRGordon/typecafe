import { useSession } from "next-auth/react";
import Link from "next/link";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";
import { MaterialNavIcon } from "./MaterialNavIcon";

export const BottomNavigation = () => {
    const router = useRouter();
    const { data: sessionData } = useSession();
    const getNavButtonClass = (href: string) => {
        const isActive = router.pathname === href || (href !== "/" && router.pathname.startsWith(href))

        return `flex h-full flex-1 cursor-pointer items-center justify-center px-4 py-3 transition-colors hover:bg-base-300 active:bg-base-300 ${isActive ? "bg-base-300 text-base-content" : ""}`
    }
    const navIconClass = "h-6 w-6 shrink-0"

    return (
        <div className="flex md:hidden">
            {/* Bottom Navigation */}
            <div className="typing-focus-global-fade btm-nav fixed bottom-0 left-0 right-0 z-50 flex h-16 min-h-16 w-full bg-base-200" data-testid="bottom-primary-nav">
                {/* Real <a href> links (next/link) so Googlebot can crawl these
                    internal pages - onClick nav is invisible to it (growth-seo §E). */}
                {/* Home */}
                <Link href="/" className={getNavButtonClass('/')} aria-label="Home" title="Home">
                    <MaterialNavIcon name="home" className={navIconClass} />
                </Link>
                {/* Progress */}
                <Link href="/progress" className={getNavButtonClass('/progress')} aria-label="Progress" title="Progress">
                    <MaterialNavIcon name="trending_up" className={navIconClass} />
                </Link>
                {/* Train */}
                <Link href="/train" className={getNavButtonClass('/train')} aria-label="Train" title="Train">
                    <MaterialNavIcon name="fitness_center" className={navIconClass} />
                </Link>
                {/* Daily Challenge hidden for now (2026-07) - see SideNavigation. */}
                {/* Leaderboard */}
                <Link href="/leaderboard" className={getNavButtonClass('/leaderboard')} aria-label="Leaderboard" title="Leaderboard">
                    <MaterialNavIcon name="leaderboard" className={navIconClass} />
                </Link>
                {/* Profile, if signed in */}
                {sessionData?.user &&
                    <Link href="/profile" className={getNavButtonClass('/profile')} aria-label="Profile" title="Profile">
                        <Avatar size={25} image={sessionData.user.image} name={sessionData.user.username ?? sessionData.user.name} />
                    </Link>
                }
            </div>
        </div>
    )
}

// {/* Privacy Policy */}
// <button onClick={() => router.push('/privacy-policy')}>
//     <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24" x="0"/></g><g><g><g><path d="M12,17c1.1,0,2-0.9,2-2s-0.9-2-2-2s-2,0.9-2,2S10.9,17,12,17z M18,8h-1V6c0-2.76-2.24-5-5-5S7,3.24,7,6v2H6 c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V10C20,8.9,19.1,8,18,8z M8.9,6c0-1.71,1.39-3.1,3.1-3.1 s3.1,1.39,3.1,3.1v2H8.9V6z M18,20H6V10h12V20z"/></g></g></g></svg>
// </button>
// {/* Terms and Conditions */}
// <button onClick={() => router.push('/terms-and-conditions')}>
//     <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24"/><g><path d="M19,5v14H5V5H19 M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3L19,3z"/></g><path d="M14,17H7v-2h7V17z M17,13H7v-2h10V13z M17,9H7V7h10V9z"/></g></svg>
// </button>
// {/* Contact */}
// <button onClick={() => router.push('/contact')}>
//     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z" /></svg>
// </button>
