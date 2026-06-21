import Image from "next/image";
import { useRouter } from "next/router";
import { TestModes, type TestSubModes } from "~/components/typer/types";
import { api } from "~/utils/api";

interface LeaderboardListProps {
    subMode: TestSubModes;
    count: number;
    date: Date | undefined;
    language: string;
}

// The public leaderboard: one row per user (their single best run by net WPM in
// the window). Net is the headline "WPM"; raw is shown beside it as a secondary
// reference. Distinct from <Scores>, which lists every test of one user.
const LeaderboardList = (props: LeaderboardListProps) => {
    const router = useRouter();
    const { subMode, count, date, language } = props;

    const { data: testType } = api.type.get.useQuery({ mode: TestModes.normal, subMode, language });
    const { data: rows, isLoading } = api.test.getLeaderboard.useQuery(
        { typeId: testType?.id ?? "", count, date, limit: 50, page: 0 },
        { enabled: !!testType },
    );

    const showEmptyState = !isLoading && rows?.length === 0;

    const navigateProfile = async (username: string) => {
        await router.push(`/profile/${username}`);
    };

    return (
        <div id="leaderboard" className="flex basis-0 grow w-full items-stretch justify-center">
            <div className="flex basis-0 grow justify-stretch flex-col overflow-x-auto overflow-y-hidden w-full gap-2">
                <div className="flex basis-0 grow items-stretch overflow-auto mb-[2rem]">
                    <div className="flex basis-0 grow justify-stretch flex-col table-zebra w-full z-0">
                        <div className="flex w-full sticky top-0 z-50">
                            <div className="flex w-full justify-stretch bg-b2 p-4 rounded-t-lg">
                                <div className="flex w-[10%] md:[5%]"></div>
                                <div className="flex basis-0 grow">User</div>
                                <div className="flex basis-0 grow">WPM</div>
                                <div className="flex basis-0 grow hidden sm:flex">Raw</div>
                                <div className="flex basis-0 grow hidden sm:flex">Accuracy</div>
                                <div className="flex basis-0 grow hidden md:flex">Date</div>
                            </div>
                        </div>
                        <div id="list" className="flex basis-0 grow flex-col w-full items-center overflow-auto no-scrollbar">
                            {rows?.map((row, index) => (
                                <div className={`flex w-full justify-stretch px-4 py-4 ${index % 2 == 1 ? "bg-b2" : ""}`} key={row.userId}>
                                    <div className="flex w-[10%] md:[5%] items-center">{row.rank}</div>
                                    <div className="flex basis-0 grow items-center">
                                        <div className="flex basis-0 grow items-center space-x-3 cursor-pointer" onClick={() => void navigateProfile(row.username)}>
                                            <div className="avatar">
                                                <div className="mask mask-squircle w-12 h-12">
                                                    {row.image ?
                                                        <Image className="rounded-full" width={500} height={500} src={row.image} alt="Profile Picture" referrerPolicy="no-referrer" />
                                                        :
                                                        <div className="avatar placeholder">
                                                            <div className="bg-neutral text-white rounded-full w-12">
                                                                <span className="text-xl font-bold">{row.username.charAt(0).toUpperCase()}</span>
                                                            </div>
                                                        </div>
                                                    }
                                                </div>
                                            </div>
                                            <div className="font-bold">{row.username}</div>
                                        </div>
                                    </div>
                                    <div className="flex basis-0 grow items-center font-mono">{row.wpm.toFixed(2)}</div>
                                    <div className="flex basis-0 grow items-center hidden sm:flex font-mono text-base-content/60">{row.rawWpm.toFixed(2)}</div>
                                    <div className="flex basis-0 grow items-center hidden sm:flex">{row.accuracy.toFixed(2)} %</div>
                                    <div className="flex basis-0 grow items-center hidden md:flex">{row.createdAt.toLocaleDateString()}</div>
                                </div>
                            ))}
                            {showEmptyState ?
                                <div className="flex w-full justify-center px-4 py-10 text-center bg-b2">
                                    <div className="flex max-w-md flex-col gap-1">
                                        <span className="font-semibold">No scores for this leaderboard yet.</span>
                                        <span className="text-sm opacity-70">Complete a matching test to claim the first spot.</span>
                                    </div>
                                </div>
                                :
                                isLoading ?
                                    <div className="flex w-full justify-center px-4 py-4">
                                        <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                    </div>
                                    :
                                    null
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeaderboardList;
