import { useState, useEffect, useRef } from "react"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { api } from "~/utils/api"
import type { Test, User } from "@prisma/client"
import Image from "next/image";

function isBottom(ref: React.RefObject<HTMLDivElement>) {
    if (!ref.current) {
        return false;
    }
    return ref.current.scrollHeight - ref.current.offsetHeight <= ref.current.scrollTop;
}

interface LeaderboardProps {
    byUser?: boolean,
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    date: Date | undefined,
    language: string,
}

const Scores = (props: LeaderboardProps) => {
    const { mode, subMode, count, date, language } = props;
    const [allTests, setAllTests] = useState<(Test & { user: User; })[] | undefined>(undefined)
    const limit = 16
    const [page, setPage] = useState(0)

    // scrollable div
    const contentRef = useRef<HTMLTableSectionElement>(null);

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language: language })
    const { data: tests, isLoading: isLoadingTests, isRefetching } = api.test.getAll.useQuery({
        byUser: props.byUser ? props.byUser : false,
        orderBy: "score",
        order: "desc",
        count,
        date,
        typeId: testType ? testType.id : "",
        limit,
        page,
    })

    // Hook on scroll
    useEffect(() => {
        const onScroll = () => {
            if (isBottom(contentRef) && !isLoadingTests) {
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
    }, [contentRef, count, mode, date, limit, page, isLoadingTests]);

    useEffect(() => {
        function uniqueById(items: (Test & {
            user: User;
        })[]) {
            const set = new Set();
            return items.filter((item) => {
                const isDuplicate = set.has(item.id);
                set.add(item.id);
                return !isDuplicate;
            });
        }
        if (tests && !isLoadingTests && !isRefetching) {
            setAllTests(prevTests => {
                if (prevTests)
                    return uniqueById([...prevTests, ...tests]);
                else return tests
            })
        }
    }, [isLoadingTests, tests, isRefetching])

    useEffect(() => {
        setAllTests(undefined)
        setPage(0)
    }, [subMode, count, date, language])

    return (
        <>
            <div id="leaderboard" className="flex basis-0 grow w-full items-stretch justify-center">
                <div className="flex basis-0 grow justify-stretch flex-col overflow-x-auto overflow-y-hidden w-full gap-2">
                    <div ref={contentRef} id="list" className="flex basis-0 grow items-stretch overflow-auto mb-[2rem]">
                        <table className="flex basis-0 grow justify-stretch flex-col table-zebra w-full z-0">
                            <thead className="flex w-full sticky top-0 z-50">
                                <div className="flex w-full justify-stretch bg-b2 p-4 rounded-t-lg">
                                    <div className="flex w-[10%] md:[5%]"></div>
                                    <div className="flex basis-0 grow">User</div>
                                    <div className="flex basis-0 grow rounded-tr-lg sm:rounded-tr-none">WPM</div>
                                    <div className="flex basis-0 grow hidden rounded-tr-lg md:rounded-tr-none sm:table-cell">Accuracy</div>
                                    <div className="flex basis-0 grow hidden md:table-cell">Date</div>
                                </div>
                            </thead>
                            <tbody className="flex basis-0 grow flex-col w-full overflow-auto no-scrollbar">
                                {allTests?.map((test, index) => {
                                    return (
                                        <div className={`flex w-full justify-stretch px-4 py-4 ${index % 2 == 1 ? 'bg-b2' : '' }`} key={index}>
                                            <div className="flex w-[10%] md:[5%] items-center">{index + 1}</div>
                                            <div className="flex basis-0 grow items-center">
                                                <div className="flex basis-0 grow items-center items-center space-x-3">
                                                    <div className="avatar">
                                                        <div className="mask mask-squircle w-12 h-12">
                                                            <Image width={500} height={500} src={test.user.image ?? ""} alt="" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{test.user.name}</div>
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
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Scores;