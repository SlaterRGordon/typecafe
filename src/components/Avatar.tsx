import { useSession } from "next-auth/react";
import Image from "next/image";

interface AvatarProps {
    size: number;
}

export const Avatar = (props: AvatarProps) => {
    const { data: sessionData } = useSession();

    return (
        <div className="rounded-full bg-neutral-focus text-neutral-content">
            {sessionData?.user?.image ?
                <Image
                    width={props.size}
                    height={props.size}
                    src={sessionData.user.image}
                    alt={sessionData.user.name ?? ""}
                    referrerPolicy="no-referrer"
                    style={{ objectFit: "cover" }}
                />
                :
                <span>AA</span>
            }
        </div>
    )
}