import type { NextPage } from "next";
import { useRouter } from "next/router";
import { ProfileView } from "~/components/profile/ProfileView";
import { api } from "~/utils/api";

const ProfilePage: NextPage = () => {
    const router = useRouter()
    const username = router.query?.username?.toString() ?? ""
    const { data, isLoading } = api.user.getProfileByUsername.useQuery({ username });

    return (
        <div className="flex h-full w-full flex-col overflow-auto overflow-x-hidden">
            <ProfileView user={data} isLoading={isLoading} />
        </div>
    )
};

export default ProfilePage;
