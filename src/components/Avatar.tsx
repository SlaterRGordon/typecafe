import { useSession } from "next-auth/react";
import Image from "next/image";

interface AvatarProps {
    size: number | string;
}

export const Avatar = (props: AvatarProps) => {
    const { data: sessionData } = useSession();

    return (
        <div className="avatar placeholder">
            <div style={{width: props.size}} className="rounded-full bg-neutral-focus text-neutral-content">
                {sessionData?.user?.image ?
                    <img src={sessionData.user.image} alt={sessionData.user.name ?? ""} referrerPolicy="no-referrer" />
                    :
                    <span>AA</span>
                }
            </div>
        </div>
    )
}