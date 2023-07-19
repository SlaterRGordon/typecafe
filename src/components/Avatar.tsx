import { useSession } from "next-auth/react";
import Image from "next/image";

interface AvatarProps {
    size: number | string;
}

export const Avatar = (props: AvatarProps) => {
    const { data: sessionData } = useSession();

    return (
        <div className="avatar placeholder">
            <div style={{width: props.size, minWidth: '1.5rem'}} className="mask mask-circle">
                <Image width={500} height={500} src={sessionData?.user.image ?? ""} alt="" referrerPolicy="no-referrer" />
            </div>
        </div>
    )
}