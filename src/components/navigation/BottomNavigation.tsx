import { useSession } from "next-auth/react";
import { Avatar } from "../Avatar";
import { useRouter } from "next/router";

export const BottomNavigation = () => {
    const router = useRouter();
    const { data: sessionData } = useSession();

    return (
        <div className="flex">
            {/* Bottom Navigation */}
            <div className="btm-nav z-50 bg-base-200 md:hidden">
                {/* Home */}
                <button onClick={() => router.push('/')} className="hover:active">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10v9Zm0 2q-.825 0-1.413-.588T4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.275-.2.575-.3T12 3.5q.325 0 .625.1t.575.3l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-5v-6h-2v6H6Zm6-8.75Z" /></svg>
                </button>
                {/* Learn */}
                {/* <button onClick={() => router.push('/learn')} className="hover:active">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20.725q-.25 0-.488-.063t-.462-.187l-5-2.7q-.5-.275-.775-.737T5 16v-4.8L2.6 9.875q-.275-.15-.4-.375T2.075 9q0-.275.125-.5t.4-.375l8.45-4.6q.225-.125.463-.188T12 3.275q.25 0 .488.063t.462.187l9.525 5.2q.25.125.388.363T23 9.6V16q0 .425-.288.713T22 17q-.425 0-.713-.288T21 16v-5.9l-2 1.1V16q0 .575-.275 1.038t-.775.737l-5 2.7q-.225.125-.462.188t-.488.062Zm0-8.025L18.85 9L12 5.3L5.15 9L12 12.7Zm0 6.025l5-2.7V12.25l-4.025 2.225q-.225.125-.475.188t-.5.062q-.25 0-.5-.063t-.475-.187L7 12.25v3.775l5 2.7Zm0-6.025Zm0 3.025Zm0 0Z" /></svg>
                </button> */}
                {/* Leaderboard */}
                <button onClick={() => router.push('/leaderboard')} className="hover:active">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11v8h4v-8H4Zm6-6v14h4V5h-4Zm6 8v6h4v-6h-4Zm4 8H4q-.825 0-1.413-.588T2 19v-8q0-.825.588-1.413T4 9h4V5q0-.825.588-1.413T10 3h4q.825 0 1.413.588T16 5v6h4q.825 0 1.413.588T22 13v6q0 .825-.588 1.413T20 21Z" /></svg>
                </button>
                {/* Articles */}
                <button onClick={() => router.push('/blog')} className="hover:active">
                    <svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><g><rect fill="none" height="24" width="24"/><g><path d="M19,5v14H5V5H19 M19,3H5C3.9,3,3,3.9,3,5v14c0,1.1,0.9,2,2,2h14c1.1,0,2-0.9,2-2V5C21,3.9,20.1,3,19,3L19,3z"/></g><path d="M14,17H7v-2h7V17z M17,13H7v-2h10V13z M17,9H7V7h10V9z"/></g></svg>                
                </button>
                {/* Profile, if signed in */}
                {sessionData?.user &&
                    <button onClick={() => router.push('/profile')} className="hover:active">
                        <Avatar size={25} />
                    </button>
                }
            </div>
        </div>
    )
}