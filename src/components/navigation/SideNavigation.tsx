import { useSession } from "next-auth/react";
import { useState } from "react";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";
import { SHOW_PLAN_NAVIGATION } from "~/lib/features";
import { MaterialNavIcon } from "./MaterialNavIcon";

// The legal/support links that used to sit in the page footer, now rolled into
// one "More" popover at the bottom of the rail.
const MORE_LINKS = [
    { href: "/support", label: "Support Me" },
    { href: "/contact", label: "Contact Us" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/terms-and-conditions", label: "Terms" },
    { href: "/how-we-measure", label: "How we measure" },
];

export const SideNavigation = () => {
    const router = useRouter();
    const { data: sessionData } = useSession();
    const [isExpanded, setIsExpanded] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const moreActive = MORE_LINKS.some((link) => router.pathname.startsWith(link.href));
    const getNavButtonClass = (href: string) => {
        const isActive = router.pathname === href || (href !== "/" && router.pathname.startsWith(href))

        return `btn btn-ghost m-2 flex h-12 min-h-12 flex-row items-center justify-start overflow-hidden whitespace-nowrap normal-case ${isActive ? "bg-base-300 text-base-content" : ""}`
    }
    const navLabelClass = `text-lg normal-case ml-2 whitespace-nowrap ${isExpanded ? 'block' : 'hidden'}`
    const navIconClass = "h-6 w-6 shrink-0"

    return (
        <div
            className={`typing-focus-global-fade fixed flex-col justify-between h-full pt-[4rem] z-[45] bg-base-200 hidden md:flex transition-all duration-150 ease-out ${isExpanded ? 'w-64' : 'w-[4.6rem]'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => { setIsExpanded(false); setMoreOpen(false); }}
        >
            <div className="flex flex-col" data-testid="side-primary-nav">
                {/* Home */}
                <button onClick={() => router.push('/')} className={getNavButtonClass('/')} aria-label="Home" title="Home">
                    <MaterialNavIcon name="home" className={navIconClass} />
                    <div className={navLabelClass}>Home</div>
                </button>
                {/* Practise */}
                <button onClick={() => router.push('/train')} className={getNavButtonClass('/train')} aria-label="Train" title="Train">
                    <MaterialNavIcon name="fitness_center" className={navIconClass} />
                    <div className={navLabelClass}>Train</div>
                </button>
                {/* Progress */}
                <button onClick={() => router.push('/progress')} className={getNavButtonClass('/progress')} aria-label="Progress" title="Progress">
                    <MaterialNavIcon name="trending_up" className={navIconClass} />
                    <div className={navLabelClass}>Progress</div>
                </button>
                {/* Daily Challenge */}
                <button onClick={() => router.push('/challenge')} className={getNavButtonClass('/challenge')} aria-label="Daily Challenge" title="Daily Challenge">
                    <MaterialNavIcon name="calendar_today" className={navIconClass} />
                    <div className={navLabelClass}>Challenge</div>
                </button>
                {/* Leaderboard */}
                <button onClick={() => router.push('/leaderboard')} className={getNavButtonClass('/leaderboard')} aria-label="Leaderboard" title="Leaderboard">
                    <MaterialNavIcon name="leaderboard" className={navIconClass} />
                    <div className={navLabelClass}>Leaderboard</div>
                </button>
                {/* Plan, if signed in */}
                {SHOW_PLAN_NAVIGATION && sessionData?.user &&
                    <button onClick={() => router.push('/plan')} className={getNavButtonClass('/plan')} aria-label="Plan" title="Plan">
                        <MaterialNavIcon name="assignment_turned_in" className={navIconClass} />
                        <div className={navLabelClass}>Plan</div>
                    </button>
                }
                {/* Profile, if signed in */}
                {sessionData?.user &&
                    <button onClick={() => router.push('/profile')} className={getNavButtonClass('/profile')} aria-label="Profile" title="Profile">
                        <Avatar size={25} image={sessionData.user.image} name={sessionData.user.username ?? sessionData.user.name} />
                        <div className={navLabelClass}>Profile</div>
                    </button>
                }
            </div>
            <div className="relative flex flex-col">
                {/* More: the legal/support links rolled into one popover. It fits within
                    the rail's expanded (16rem) width, so the pointer stays inside the
                    rail while using it — the rail's mouse-leave closes it. */}
                {moreOpen &&
                    <div data-testid="nav-more-menu" className="absolute bottom-full left-2 z-[46] mb-1 w-52 rounded-lg border border-base-content/10 bg-base-200 p-1 shadow-lg">
                        {MORE_LINKS.map((link) => (
                            <button
                                key={link.href}
                                onClick={() => { setMoreOpen(false); void router.push(link.href); }}
                                className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-base-content/10 ${router.pathname.startsWith(link.href) ? "bg-base-300 text-base-content" : "text-base-content/80 hover:text-base-content"}`}
                            >
                                {link.label}
                            </button>
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
