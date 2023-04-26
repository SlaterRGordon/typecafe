import { useSession } from "next-auth/react";

export const Avatar = () => {
    const { data: sessionData } = useSession();

    return (
        <div className="avatar placeholder">
            <div className="w-6 rounded-full bg-neutral-focus text-neutral-content">
                {sessionData?.user?.image ?
                    <img src={sessionData.user.image} alt={sessionData.user.name ?? ""} />
                    :
                    <span>AA</span>
                }
            </div>
        </div>
    )
}