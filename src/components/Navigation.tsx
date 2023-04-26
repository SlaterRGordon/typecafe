
import { signIn, signOut, useSession } from "next-auth/react";
import { Avatar } from "./Avatar";
import { ThemeSwitch } from "./ThemeSwitch";
import { useState } from "react";

export const Navigation = () => {
    const { data: sessionData } = useSession();
    const [isExpanded, setIsExpanded] = useState(false);

    const handleSignIn = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        e.stopPropagation();
        void signIn("google")
    }

    return (
        <>
            {/* Top Navigation */}
            <div className="navbar bg-base-300">
                <div className="flex-1">
                    <a className="btn btn-ghost normal-case text-xl">TypeCafe</a>
                </div>
                <div className="flex-none gap-2 px-4">
                    {/* Theme Switch */}
                    <ThemeSwitch />

                    {/* If the user is not signed in, display auth buttons */}
                    {!sessionData?.user ?
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => handleSignIn(e)}
                        >
                            Log In
                        </button>
                        :
                        <>
                            <button className="btn btn-ghost btn-circle btn-sm" onClick={() => void signOut()}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15.325 16.275q-.275-.325-.275-.737t.275-.688l1.85-1.85H10q-.425 0-.713-.288T9 12q0-.425.288-.713T10 11h7.175l-1.85-1.85q-.3-.3-.3-.713t.3-.712q.275-.3.688-.3t.687.275l3.6 3.6q.15.15.213.325t.062.375q0 .2-.062.375t-.213.325l-3.6 3.6q-.325.325-.713.288t-.662-.313ZM5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h6q.425 0 .713.288T12 4q0 .425-.288.713T11 5H5v14h6q.425 0 .713.288T12 20q0 .425-.288.713T11 21H5Z" /></svg>
                            </button>
                        </>
                    }
                </div>
            </div>


            {/* Desktop Navigation */}
            <div 
                className={`fixed flex-col h-screen bg-base-200 hidden md:flex transition-all duration-400 ease-out ${isExpanded ? 'w-64' : 'w-[4.6rem]'}`}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => setIsExpanded(false)}
            >
                <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Home</div>
                </button>
                <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Practise</div>
                </button>
                <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Leaderboard</div>
                </button>
                <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5c0 .12.05.23.13.33c.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 0 1 2.5-2.5H16c2.21 0 4-1.79 4-4c0-3.86-3.59-7-8-7z" /><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" /><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Colors</div>
                </button>
                {sessionData?.user &&
                    <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                        <Avatar />
                        <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Profile</div>
                    </button>
                }
            </div>

            {/* Mobile Navigation */}
            <div className="flex md:hidden">
                {/* Bottom Navigation */}
                <div className="btm-nav bg-base-200">
                    {/* Home */}
                    <button className="hover:active">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                    </button>
                    {/* Learn */}
                    <button className="hover:active">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                    </button>
                    {/* Leaderboard */}
                    <button className="hover:active">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                    </button>
                    {/* Color */}
                    <button className="hover:active">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5c0 .12.05.23.13.33c.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 0 1 2.5-2.5H16c2.21 0 4-1.79 4-4c0-3.86-3.59-7-8-7z" /><circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" /><circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" /><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" /></svg>
                    </button>
                    {/* Profile */}
                    <button className="hover:active">
                        <Avatar />
                    </button>
                </div>
            </div>
        </>
    )
}