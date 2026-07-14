import type { NextPage } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { ProfileView } from "~/components/profile/ProfileView";
import { api } from "~/utils/api";

function ProfileUnavailable(props: { failed: boolean; onRetry: () => void }) {
    return (
        <main className="flex h-full w-full items-center justify-center px-4 py-12">
            <section className="w-full max-w-lg rounded-lg border border-base-content/10 bg-base-200/45 p-8 text-center">
                <div className="text-4xl" aria-hidden="true">{props.failed ? "!" : "?"}</div>
                <h1 className="mt-3 text-2xl font-bold">
                    {props.failed ? "Profile unavailable" : "Profile not found"}
                </h1>
                <p className="mt-2 text-base-content/70">
                    {props.failed
                        ? "TypeCafe couldn't load this profile. Your connection may have dropped."
                        : "This account may have been renamed or removed."}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {props.failed ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={props.onRetry}>
                            Try again
                        </button>
                    ) : null}
                    <Link className={`btn btn-sm ${props.failed ? "btn-ghost" : "btn-primary"}`} href="/leaderboard">
                        Browse leaderboard
                    </Link>
                </div>
            </section>
        </main>
    );
}

const ProfilePage: NextPage = () => {
    const router = useRouter()
    const username = router.query?.username?.toString() ?? ""
    const profile = api.user.getProfileByUsername.useQuery(
        { username },
        { enabled: router.isReady && username.length > 0, retry: false },
    );

    if (!router.isReady || profile.isLoading) {
        return <ProfileView user={undefined} isLoading />;
    }

    if (profile.isError || !profile.data) {
        return <ProfileUnavailable failed={profile.isError} onRetry={() => void profile.refetch()} />;
    }

    return (
        <div className="flex h-full w-full flex-col overflow-auto overflow-x-hidden">
            <ProfileView user={profile.data} isLoading={false} />
        </div>
    )
};

export default ProfilePage;
