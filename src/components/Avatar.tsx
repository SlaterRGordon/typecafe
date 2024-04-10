import { useSession } from "next-auth/react";
import Image from "next/image";

interface AvatarProps {
    size: number | string;
}

export const Avatar = (props: AvatarProps) => {
    const { data: sessionData } = useSession();

    return (
        <div className="avatar placeholder">
            <div style={{ width: props.size, minWidth: '1.5rem' }} className="mask mask-circle">
                {sessionData?.user.image ?
                    <Image width={500} height={500} src={sessionData?.user.image ?? ""} alt="Profile Picture" referrerPolicy="no-referrer" />
                    :
                    <div className="avatar placeholder">
                        <div className="bg-neutral text-neutral-content rounded-full w-24">
                            <span className="text-md">{sessionData?.user.name?.charAt(0).toUpperCase() ?? ""}</span>
                        </div>
                    </div>
                }
            </div>
        </div>
    )
}