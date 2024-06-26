import { useState, useEffect, useRef, use } from "react"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { api } from "~/utils/api"
import type { Test, User } from "@prisma/client"
import Image from "next/image";
import { useRouter } from "next/router";

function isBottom(ref: React.RefObject<HTMLDivElement>) {
    if (!ref.current) {
        return false;
    }
    return ref.current.scrollHeight - ref.current.offsetHeight <= ref.current.scrollTop;
}

interface LeaderboardProps {
    userId?: string,
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    date: Date | undefined,
    language: string,
    update?: boolean,
}

const Scores = (props: LeaderboardProps) => {
    const router = useRouter()
    const { mode, subMode, count, date, language } = props;
    const [allTests, setAllTests] = useState<(Test & { user: User; })[] | undefined>(undefined)
    const limit = 16
    const [page, setPage] = useState(0)
    const [loadingList, setLoadingList] = useState(true)

    // scrollable div
    const contentRef = useRef<HTMLTableSectionElement>(null);

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language: language })
    const { data: tests, isLoading: isLoadingTests, refetch, isRefetching } = api.test.getAll.useQuery({
        userId: props.userId ? props.userId : undefined,
        orderBy: "score",
        order: "desc",
        count,
        date,
        typeId: testType ? testType.id : "",
        limit,
        page,
    })

    const navigateProfile = async (username: string | null) => {
        if (!username) return
        await router.push(`/profile/${username}`)
        return
    }

    useEffect(() => {
        setAllTests(undefined)
        setPage(0)
        refetch().then(() => {
            // console.log("refetched")
        }).catch((err) => {
            console.log(err)
        })
    }, [props.update, refetch])

    // Hook on scroll
    useEffect(() => {
        const onScroll = () => {
            if (isBottom(contentRef) && !isLoadingTests && !isRefetching) {
                setLoadingList(true)
                setPage(page + 1)
            }
        };

        const list = contentRef.current;
        if (list) {
            list.addEventListener('scroll', onScroll);

            return () => {
                list.removeEventListener('scroll', onScroll);
            }
        }
    }, [contentRef, count, mode, date, limit, page, isLoadingTests, isRefetching]);

    useEffect(() => {
        function uniqueById(
            prev: (Test & { user: User; })[],
            curr: (Test & { user: User; })[]
        ) {
            return curr.filter((currItem) => {
                if (prev.find((prevItem) => prevItem.id === currItem.id)) return false;
                else return true;
            })
        }

        if (tests && !isLoadingTests && !isRefetching) {
            setAllTests(prevTests => {
                let uniqueTests = uniqueById(prevTests ?? [], tests ?? [])

                if (props.userId) {
                    prevTests = prevTests?.filter((test) => test.user.id === props.userId)
                    uniqueTests = uniqueTests.filter((test) => test.user.id === props.userId)
                }

                if (prevTests) {
                    return [...prevTests, ...uniqueTests]
                }
                else {
                    return uniqueTests
                }
            })

            setLoadingList(false)
        }
    }, [isLoadingTests, tests, isRefetching, props.userId])

    useEffect(() => {
        setAllTests(undefined)
        setPage(0)
    }, [subMode, count, date, language])

    return (
        <>
            <div id="leaderboard" className="flex basis-0 grow w-full items-stretch justify-center">
                <div className="flex basis-0 grow justify-stretch flex-col overflow-x-auto overflow-y-hidden w-full gap-2">
                    <div className="flex basis-0 grow items-stretch overflow-auto mb-[2rem]">
                        <div className="flex basis-0 grow justify-stretch flex-col table-zebra w-full z-0">
                            <div className="flex w-full sticky top-0 z-50">
                                <div className="flex w-full justify-stretch bg-b2 p-4 rounded-t-lg">
                                    <div className="flex w-[10%] md:[5%]"></div>
                                    <div className="flex basis-0 grow">User</div>
                                    <div className="flex basis-0 grow rounded-tr-lg sm:rounded-tr-none">WPM</div>
                                    <div className="flex basis-0 grow hidden rounded-tr-lg md:rounded-tr-none sm:table-cell">Accuracy</div>
                                    <div className="flex basis-0 grow hidden md:table-cell">Date</div>
                                </div>
                            </div>
                            <div ref={contentRef} id="list" className="flex basis-0 grow flex-col w-full items-center overflow-auto no-scrollbar">
                                {allTests?.map((test, index) => {
                                    return (
                                        <div className={`flex w-full justify-stretch px-4 py-4 ${index % 2 == 1 ? 'bg-b2' : ''}`} key={index}>
                                            <div className="flex w-[10%] md:[5%] items-center">{index + 1}</div>
                                            <div className="flex basis-0 grow items-center">
                                                <div className="flex basis-0 grow items-center items-center space-x-3 cursor-pointer" onClick={(e) => navigateProfile(test.user.username)}>
                                                    <div className="avatar">
                                                        <div className="mask mask-squircle w-12 h-12">
                                                            {test?.user.image ?
                                                                <Image className="rounded-full" width={500} height={500} src={test.user.image ?? ""} alt="Profile Picture" referrerPolicy="no-referrer" />
                                                                :
                                                                <div className="avatar placeholder">
                                                                    <div className="bg-neutral text-white rounded-full w-12">
                                                                        <span className="text-xl font-bold">{test?.user.username?.charAt(0).toUpperCase() ?? ""}</span>
                                                                    </div>
                                                                </div>
                                                            }
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{test.user.username}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`flex basis-0 grow items-center ${index + 1 == allTests.length ? "rounded-br-lg sm:rounded-br-none" : ""}`}>
                                                {test.speed.toFixed(2)}
                                            </div>
                                            <div className={`flex basis-0 grow items-center hidden sm:flex ${index + 1 == allTests.length ? "rounded-br-lg md:rounded-br-none" : ""}`}>
                                                {test.accuracy.toFixed(2)} %
                                            </div>
                                            <div className="flex basis-0 grow items-center hidden md:flex">{test.createdAt.toLocaleDateString()}</div>
                                        </div>
                                    )
                                })}
                                {loadingList ?
                                    <div className={`flex w-full justify-center px-4 py-4 ${allTests ? allTests.length + 1 : 0 % 2 == 1 ? 'bg-b2' : ''}`}>
                                        <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                    </div>
                                    :
                                    <div className={`flex w-full justify-center px-4 py-4 ${allTests ? allTests.length + 1 : 0 % 2 == 1 ? 'bg-b2' : ''}`}>
                                        <div className="w-8 h-8"></div>
                                    </div>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Scores;