import { useSession } from "next-auth/react";
import Image from "next/image";

interface AvatarProps {
    size: number | string;
}

export const Avatar = (props: AvatarProps) => {
    const { data: sessionData } = useSession();

    return (
        <div className="avatar">
            <div style={{maxWidth: props.size, minWidth: '1.5rem'}} className="mask mask-circle">
                <Image width={500} height={500} src={sessionData?.user.image ?? ""} alt="" />
            </div>
        </div>
        // <div className="avatar placeholder">
        //     <div style={{maxWidth: props.size, minWidth: '1.5rem'}} className="rounded-full bg-neutral-focus text-neutral-content">
        //         {sessionData?.user?.image ?
        //             <Image width={500} height={500} src={sessionData.user.image} alt={sessionData.user.name ?? ""} referrerPolicy="no-referrer" />
        //             :
        //             <span>AA</span>
        //         }
        //     </div>
        // </div>
    )
}