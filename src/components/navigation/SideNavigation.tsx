import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";
import { MaterialNavIcon } from "./MaterialNavIcon";
import { GUIDE_ROUTES } from "~/lib/guides";
import { useDailySessionBadge } from "~/hooks/useDailyCoachingSession";

// The legal/support links that used to sit in the page footer, now rolled into
// one "More" popover at the bottom of the rail. Guide articles live behind the
// /guides hub - new articles get a card there, never a nav item.
const MORE_LINKS = [
    { href: "/guides", label: "Guides" },
    { href: "/support", label: "Support Me" },
    { href: "/contact", label: "Contact Us" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/terms-and-conditions", label: "Terms" },
    { href: "/how-we-measure", label: "How we measure" },
];

export const SideNavigation = () => {
    const router = useRouter();
    const { data: sessionData } = useSession();
    const dailyBadge = useDailySessionBadge();
    const [isExpanded, setIsExpanded] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    // Guide articles keep highlighting "More" even though only the hub is listed.
    const moreActive = [...MORE_LINKS.map((link) => link.href), ...GUIDE_ROUTES].some((href) => router.pathname.startsWith(href));
    const getNavButtonClass = (href: string) => {
        const isActive = router.pathname === href || (href !== "/" && router.pathname.startsWith(href))

        return `btn btn-ghost m-2 flex h-12 min-h-12 flex-row items-center justify-start overflow-hidden whitespace-nowrap normal-case ${isActive ? "bg-base-300 text-base-content" : ""}`
    }
    const navLabelClass = `text-lg normal-case ml-2 whitespace-nowrap ${isExpanded ? 'block' : 'hidden'}`
    const navIconClass = "h-6 w-6 shrink-0"

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("typecafe:side-nav-expanded", { detail: isExpanded }));
    }, [isExpanded]);

    return (
        <div
            className={`typing-focus-global-fade fixed flex-col justify-between h-full pt-[4rem] z-[45] bg-base-200 hidden md:flex transition-all duration-150 ease-out ${isExpanded ? 'w-64' : 'w-[4.6rem]'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => { setIsExpanded(false); setMoreOpen(false); }}
        >
            <div className="flex flex-col" data-testid="side-primary-nav">
                {/* Real <a href> links (via next/link) so Googlebot can crawl the
                    internal pages and pass link equity - onClick nav is invisible
                    to it (growth-seo §E). SPA behaviour is unchanged. */}
                {/* Home */}
                <Link href="/" className={getNavButtonClass('/')} aria-label="Home" title="Home">
                    <MaterialNavIcon name="home" className={navIconClass} />
                    <div className={navLabelClass}>Home</div>
                </Link>
                {/* Progress */}
                <Link href="/progress" className={getNavButtonClass('/progress')} aria-label="Progress" title="Progress">
                    <MaterialNavIcon name="trending_up" className={navIconClass} />
                    <div className={navLabelClass}>Progress</div>
                </Link>
                {/* Practise */}
                <Link href="/train" className={getNavButtonClass('/train')} aria-label="Train" title="Train">
                    <MaterialNavIcon name="fitness_center" className={navIconClass} />
                    <div className={navLabelClass}>Train</div>
                </Link>
                {/* Daily coaching - the dot marks an unfinished session; it
                    clears when today is done. */}
                <Link href="/plan" className={getNavButtonClass('/plan')} aria-label="Daily coaching" title="Daily coaching" data-testid="nav-today">
                    <span className="relative">
                        <MaterialNavIcon name="today" className={navIconClass} />
                        {dailyBadge === "active" &&
                            <span data-testid="nav-today-dot" aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
                        }
                    </span>
                    <div className={navLabelClass}>Daily Coach</div>
                </Link>
                {/* Daily Challenge hidden for now (2026-07) - /challenge still
                    exists; restore the link from git history when it returns. */}
                {/* Leaderboard */}
                <Link href="/leaderboard" className={getNavButtonClass('/leaderboard')} aria-label="Leaderboard" title="Leaderboard">
                    <MaterialNavIcon name="leaderboard" className={navIconClass} />
                    <div className={navLabelClass}>Leaderboard</div>
                </Link>
                {/* Profile, if signed in */}
                {sessionData?.user &&
                    <Link href="/profile" className={getNavButtonClass('/profile')} aria-label="Profile" title="Profile">
                        <Avatar size={25} image={sessionData.user.image} name={sessionData.user.username ?? sessionData.user.name} />
                        <div className={navLabelClass}>Profile</div>
                    </Link>
                }
            </div>
            <div className="relative flex flex-col">
                {/* More: the legal/support links rolled into one popover. It fits within
                    the rail's expanded (16rem) width, so the pointer stays inside the
                    rail while using it - the rail's mouse-leave closes it. */}
                {moreOpen &&
                    <div data-testid="nav-more-menu" className="absolute bottom-full left-2 z-[46] mb-1 w-52 rounded-lg border border-base-content/10 bg-base-200 p-1 shadow-lg">
                        {MORE_LINKS.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMoreOpen(false)}
                                className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-base-content/10 ${router.pathname.startsWith(link.href) ? "bg-base-300 text-base-content" : "text-base-content/80 hover:text-base-content"}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                }
                <button
                    onClick={() => setMoreOpen((open) => !open)}
                    className={`${getNavButtonClass('__more__')} ${moreActive ? "bg-base-300 text-base-content" : ""}`}
                    aria-label="More" title="More" aria-expanded={moreOpen} data-testid="nav-more"
                >
                    <MaterialNavIcon name="more_horiz" className={navIconClass} />
                    <div className={navLabelClass}>More</div>
                </button>
            </div>
        </div>
    )
}
