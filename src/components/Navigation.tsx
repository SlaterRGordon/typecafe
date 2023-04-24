import { signIn, signOut, useSession } from "next-auth/react";

export const Navigation = () => {
    const { data: sessionData } = useSession();

    return (
        <></>
    )
}