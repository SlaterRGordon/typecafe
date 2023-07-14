import { useState, useEffect, useRef } from "react"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { api } from "~/utils/api"
import type { Test, User } from "@prisma/client"

function isBottom(ref: React.RefObject<HTMLDivElement>) {
    if (!ref.current) {
        return false;
    }
    return ref.current.scrollHeight - ref.current.offsetHeight <= ref.current.scrollTop;
}

interface LeaderboardProps {
    mode: TestModes,
    subMode: TestSubModes,
    count: number,
    date: Date | undefined,
}

const Scores = (props: LeaderboardProps) => {
    const { mode, subMode, count, date } = props;
    const [allTests, setAllTests] = useState<(Test & { user: User; })[] | undefined>(undefined)
    const limit = 16
    const [page, setPage] = useState(0)

    // scrollable div
    const contentRef = useRef<HTMLTableSectionElement>(null);

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language: "english" })
    const { data: tests, isLoading: isLoadingTests, isRefetching } = api.test.getAll.useQuery({
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
    }, [subMode, count, date])

    useEffect(() => {
        console.log(allTests)
    }, [allTests])

    return (
        <>
            <div id="leaderboard" className="flex w-full h-full justify-center">
                <div className="flex flex-col overflow-x-auto overflow-y-hidden w-full gap-2">
                    <div ref={contentRef} id="list" className="h-[100vh] overflow-auto">
                        <table className="table table-zebra w-full z-0">
                            <thead className="sticky top-0 z-50">
                                <tr>
                                    <th></th>
                                    <th>User</th>
                                    <th className="rounded-tr-lg sm:rounded-tr-none">WPM</th>
                                    <th className="hidden rounded-tr-lg md:rounded-tr-none sm:table-cell">Accuracy</th>
                                    <th className="hidden md:table-cell">Date</th>
                                </tr>
                            </thead>
                            <tbody className="overflow-auto no-scrollbar">
                                {allTests?.map((test, index) => {
                                    return (
                                        <tr key={index}>
                                            <th>{index + 1}</th>
                                            <td>
                                                <div className="flex items-center space-x-3">
                                                    <div className="avatar">
                                                        <div className="mask mask-squircle w-12 h-12">
                                                            <img src={test.user.image ?? ""} alt="" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="font-bold">{test.user.name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`${index + 1 == allTests.length ? "rounded-br-lg sm:rounded-br-none" : ""}`}>{test.speed.toFixed(2)}</td>
                                            <td className={`${index + 1 == allTests.length ? "rounded-br-lg md:rounded-br-none" : ""} hidden sm:table-cell`}>{test.accuracy.toFixed(2)} %</td>
                                            <td className="hidden md:table-cell">{test.createdAt.toLocaleDateString()}</td>
                                        </tr>
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