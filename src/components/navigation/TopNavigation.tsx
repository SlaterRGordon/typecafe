import { signOut, useSession } from "next-auth/react";
import { LanguageMenu } from "./LanguageMenu";
import { LayoutMenu } from "./LayoutMenu";
import Link from "next/link";

interface TopNavigationProps {
    onOpenColors: () => void;
    onOpenSignIn: () => void;
}

export const TopNavigation = ({ onOpenColors, onOpenSignIn }: TopNavigationProps) => {
    const { data: sessionData } = useSession();

    return (
        <nav data-testid="top-navigation" aria-label="Global settings" className="typing-focus-global-fade fixed navbar z-50 min-h-16 bg-base-300 px-2 sm:px-4">
            <div className="min-w-0 flex-1">
                <Link href="/" className="btn btn-ghost min-h-11 px-1 font-mono text-lg font-bold normal-case tracking-tight sm:px-4 sm:!text-xl">TypeCafe</Link>
            </div>
            <div className="flex flex-none items-center gap-1 sm:gap-2 sm:px-4">
                <LanguageMenu />
                <LayoutMenu />
                {/* Color Button */}
                <button
                    type="button"
                    data-testid="nav-color-trigger"
                    className="btn btn-sm !h-11 !min-h-11 min-w-11 gap-2 border border-base-content/20 bg-base-100 px-3 text-base-content normal-case hover:bg-base-200"
                    onClick={onOpenColors}
                    aria-label="Open color settings"
                    title="Open color settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5c0 .12.05.23.13.33c.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 0 1 2.5-2.5H16c2.21 0 4-1.79 4-4c0-3.86-3.59-7-8-7z" /><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" /><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" /></svg>
                    {/* Icon-only on phones - the labelled bar overflows once the
                        layout menu joins it. */}
                    <span className="hidden sm:inline">Colors</span>
                </button>
                {/* If the user is not signed in, display auth buttons */}
                {!sessionData?.user ?
                    <button
                        type="button"
                        data-testid="nav-auth-trigger"
                        className="btn btn-sm !h-11 !min-h-11 min-w-11 gap-2 border border-base-content/20 bg-base-100 px-3 text-base-content normal-case hover:bg-base-200"
                        onClick={onOpenSignIn}
                        aria-label="Open sign in"
                        title="Open sign in"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5l-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z" /></svg>
                        <span className="hidden sm:inline">Log In</span>
                    </button>
                    :
                    <>
                        <button type="button" data-testid="nav-auth-trigger" className="btn btn-sm !h-11 !min-h-11 min-w-11 gap-2 border border-base-content/20 bg-base-100 px-3 text-base-content normal-case hover:bg-base-200" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
                            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M15.325 16.275q-.275-.325-.275-.737t.275-.688l1.85-1.85H10q-.425 0-.713-.288T9 12q0-.425.288-.713T10 11h7.175l-1.85-1.85q-.3-.3-.3-.713t.3-.712q.275-.3.688-.3t.687.275l3.6 3.6q.15.15.213.325t.062.375q0 .2-.062.375t-.213.325l-3.6 3.6q-.325.325-.713.288t-.662-.313ZM5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h6q.425 0 .713.288T12 4q0 .425-.288.713T11 5H5v14h6q.425 0 .713.288T12 20q0 .425-.288.713T11 21H5Z" /></svg>
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </>
                }
            </div>
        </nav>
    )
}
