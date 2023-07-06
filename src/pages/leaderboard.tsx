import { type NextPage } from "next"
import { useState, useEffect, useRef } from "react"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { api } from "~/utils/api"
import type { SingleValue } from 'react-select'
import Select from 'react-select'
import type { Test, User } from "@prisma/client"

type Option = { label: string, value: number }

function isBottom(ref: React.RefObject<HTMLDivElement>) {
    if (!ref.current) {
        return false;
    }
    return ref.current.scrollHeight - ref.current.offsetHeight <= ref.current.scrollTop;
}

const Leadboard: NextPage = () => {
    const mode = TestModes.normal
    const [allTests, setAllTests] = useState<(Test & {user: User;})[] | undefined>(undefined)
    const [date, setDate] = useState<Date | undefined>(undefined)
    const [timeRange, setTimeRange] = useState(0)
    const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
    const [count, setCount] = useState(15)
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
                console.log("bottom")
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
        if (tests && !isLoadingTests && !isRefetching) {
            setAllTests(prevTests => {
                if (prevTests) return [...prevTests, ...tests]
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

    const timeRangeOptions = [
        { value: 0, label: 'Daily' },
        { value: 1, label: 'Weekly' },
        { value: 2, label: 'Monthly' },
        { value: 3, label: 'All Time' },
    ]
    const handleChangeTimeRange = (value: SingleValue<Option>) => {
        if (value) {
            setTimeRange(value.value)
        }
    }

    useEffect(() => {
        const today = new Date()
        switch (timeRange) {
            case 0:
                today.setDate(today.getDate() - 1)
                setDate(today)
                break;
            case 1:
                today.setDate(today.getDate() - 7)
                setDate(today)
                break;
            case 2:
                today.setDate(today.getDate() - 30)
                setDate(today)
                break;
            case 3:
                setDate(undefined)
                break;        
        }
    }, [timeRange])

    const subModeOptions = [
        { value: TestSubModes.timed, label: 'Timed' },
        { value: TestSubModes.words, label: 'Words' },
    ]

    const timedCountOptions = [
        { value: 15, label: '15' },
        { value: 30, label: '30' },
        { value: 60, label: '60' },
        { value: 120, label: '120' },

    ]
    const handleChangeSubMode = (value: SingleValue<Option>) => {
        if (value) {
            if (value.value == TestSubModes.timed) setCount(15)
            else setCount(10)

            setSubMode(value.value)
        }
    }

    const wordsCountOptions = [
        { value: 10, label: '10' },
        { value: 25, label: '25' },
        { value: 50, label: '50' },
        { value: 100, label: '100' },
    ]
    const handleChangeCount = (value: SingleValue<Option>) => {
        if (value) setCount(value.value)
    }

    return (
        <>
            <div id="leaderboard" className="flex w-full h-full justify-center">
                <div className="flex flex-col overflow-x-auto overflow-y-hidden w-full mx-4 py-8 gap-2">
                    <div className="flex gap-2">
                        <Select
                            instanceId="subModeSelect"
                            defaultValue={subModeOptions[0]}
                            options={subModeOptions}
                            value={subModeOptions[subMode]}
                            onChange={handleChangeSubMode}
                            isSearchable={false}
                            className="max-w-xs my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                        <Select
                            instanceId="countSelect"
                            defaultValue={subMode == TestSubModes.timed ? timedCountOptions[0] : wordsCountOptions[0]}
                            options={subMode == TestSubModes.timed ? timedCountOptions : wordsCountOptions}
                            value={
                                subMode == TestSubModes.timed ?
                                    timedCountOptions.find(option => option.value == count) :
                                    wordsCountOptions.find(option => option.value == count)
                            }
                            onChange={handleChangeCount}
                            isSearchable={false}
                            className="max-w-xs my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                        <Select
                            instanceId="timeRangeSelect"
                            defaultValue={timeRangeOptions[0]}
                            options={timeRangeOptions}
                            value={timeRangeOptions[timeRange]}
                            onChange={handleChangeTimeRange}
                            isSearchable={false}
                            className="max-w-xs my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                    </div>
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

export default Leadboard;