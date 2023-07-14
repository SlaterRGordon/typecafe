import { useSession } from "next-auth/react";
import { useState } from "react";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";

export const SideNavigation = () => {
    const router = useRouter();
    const { data: sessionData } = useSession();
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div
            className={`fixed flex-col h-full pt-[4rem] z-40 bg-base-200 hidden md:flex transition-all duration-400 ease-out ${isExpanded ? 'w-64' : 'w-[4.6rem]'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Home */}
            <button onClick={() => router.push('/')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Home</div>
            </button>
            {/* Practise */}
            <button className={`btn btn-ghost m-2 flex flex-col content-start`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Practise</div>
            </button>
            {/* Leaderboard */}
            <button onClick={() => router.push('/leaderboard')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Leaderboard</div>
            </button>
            {/* Profile, if signed in */}
            {sessionData?.user &&
                <button onClick={() => router.push('/profile')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <Avatar />
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Profile</div>
                </button>
            }
        </div>
    )
}