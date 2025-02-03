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
            className={`fixed flex-col justify-between h-full pt-[4rem] z-40 bg-base-200 hidden md:flex transition-all duration-400 ease-out ${isExpanded ? 'w-64' : 'w-[4.6rem]'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            <div className="flex flex-col">
                {/* Home */}
                <button onClick={() => router.push('/')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Home</div>
                </button>
                {/* Practise */}
                {/* <button onClick={() => router.push('/learn')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Learn</div>
                </button> */}
                {/* Leaderboard */}
                <button onClick={() => router.push('/leaderboard')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Leaderboard</div>
                </button>
                {/* Profile, if signed in */}
                {sessionData?.user &&
                    <button onClick={() => router.push('/profile')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                        <Avatar size={25} />
                        <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Profile</div>
                    </button>
                }
            </div>
            <div className="flex flex-col">
                {/* Donate */}
                <button onClick={() => router.push('/support')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8c0-4.41,3.59-8,8-8 s8,3.59,8,8C20,16.41,16.41,20,12,20z M12.89,11.1c-1.78-0.59-2.64-0.96-2.64-1.9c0-1.02,1.11-1.39,1.81-1.39 c1.31,0,1.79,0.99,1.9,1.34l1.58-0.67c-0.15-0.44-0.82-1.91-2.66-2.23V5h-1.75v1.26c-2.6,0.56-2.62,2.85-2.62,2.96 c0,2.27,2.25,2.91,3.35,3.31c1.58,0.56,2.28,1.07,2.28,2.03c0,1.13-1.05,1.61-1.98,1.61c-1.82,0-2.34-1.87-2.4-2.09L8.1,14.75 c0.63,2.19,2.28,2.78,3.02,2.96V19h1.75v-1.24c0.52-0.09,3.02-0.59,3.02-3.22C15.9,13.15,15.29,11.93,12.89,11.1z"/></g></svg>                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Support Me</div>
                </button>
                {/* Contact */}
                <button onClick={() => router.push('/contact')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z" /></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Contact Us</div>
                </button>
                {/* Privacy Policy */}
                <button onClick={() => router.push('/privacy-policy')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24" x="0" /></g><g><g><g><path d="M12,17c1.1,0,2-0.9,2-2s-0.9-2-2-2s-2,0.9-2,2S10.9,17,12,17z M18,8h-1V6c0-2.76-2.24-5-5-5S7,3.24,7,6v2H6 c-1.1,0-2,0.9-2,2v10c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V10C20,8.9,19.1,8,18,8z M8.9,6c0-1.71,1.39-3.1,3.1-3.1 s3.1,1.39,3.1,3.1v2H8.9V6z M18,20H6V10h12V20z" /></g></g></g></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Privacy Policy</div>
                </button>
                {/* Terms and Conditions */}
                <button onClick={() => router.push('/terms-and-conditions')} className={`btn btn-ghost m-2 flex flex-col content-start`}>
                    <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24"/><g><path d="M19,5v14H5V5H19 M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3L19,3z"/></g><path d="M14,17H7v-2h7V17z M17,13H7v-2h10V13z M17,9H7V7h10V9z"/></g></svg>
                    <div className={`text-lg normal-case ml-2 ${isExpanded ? 'block' : 'hidden'}`}>Terms</div>
                </button>
            </div>
        </div>
    )
}