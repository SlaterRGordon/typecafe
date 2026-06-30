import { useSession } from "next-auth/react";
import { useState } from "react";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";
import { SHOW_PLAN_NAVIGATION } from "~/lib/features";

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
            <div className="flex flex-col">
                {/* Home */}
                <button onClick={() => router.push('/')} className={getNavButtonClass('/')} aria-label="Home" title="Home">
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                    <div className={navLabelClass}>Home</div>
                </button>
                {/* Practise */}
                <button onClick={() => router.push('/learn')} className={getNavButtonClass('/learn')} aria-label="Learn" title="Learn">
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                    <div className={navLabelClass}>Learn</div>
                </button>
                {/* Leaderboard */}
                <button onClick={() => router.push('/leaderboard')} className={getNavButtonClass('/leaderboard')} aria-label="Leaderboard" title="Leaderboard">
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                    <div className={navLabelClass}>Leaderboard</div>
                </button>
                {/* Daily Challenge */}
                <button onClick={() => router.push('/challenge')} className={getNavButtonClass('/challenge')} aria-label="Daily Challenge" title="Daily Challenge">
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21L12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2Z" /></svg>
                    <div className={navLabelClass}>Challenge</div>
                </button>
                {/* Progress — always shown; guests get the sign-in pitch on the page. */}
                <button onClick={() => router.push('/progress')} className={getNavButtonClass('/progress')} aria-label="Progress" title="Progress">
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m3.5 18.5l6-6l4 4L22 6.92L20.59 5.5l-7.09 8l-4-4L2 16.99l1.5 1.51Z" /></svg>
                    <div className={navLabelClass}>Progress</div>
                </button>
                {/* Plan, if signed in */}
                {SHOW_PLAN_NAVIGATION && sessionData?.user &&
                    <button onClick={() => router.push('/plan')} className={getNavButtonClass('/plan')} aria-label="Plan" title="Plan">
                        <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1Zm-2 14l-4-4l1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8Z" /></svg>
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
                    <svg className={navIconClass} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                    <div className={navLabelClass}>More</div>
                </button>
            </div>
        </div>
    )
}
