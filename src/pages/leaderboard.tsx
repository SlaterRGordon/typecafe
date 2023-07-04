import { type NextPage } from "next";
import { useState, useEffect } from "react";
import { TestModes, TestSubModes } from "~/components/typer/types";
import { api } from "~/utils/api";

const Leadboard: NextPage = () => {
    const [mode, setMode] = useState<TestModes>(TestModes.normal)
    const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
    const [count, setCount] = useState(15)

    // fetch types
    const { data: testType, refetch: refetchTestType } = api.type.get.useQuery({ mode, subMode })
    const { data: tests, refetch: refetchTests } = api.test.getAll.useQuery({
        orderBy: "score",
        order: "desc",
        count: count,
        typeId: testType ? testType.id : ""
    })

    return (
        <>
            <div id="leaderboard" className="flex w-full h-full justify-center">
                <div className="overflow-x-hidden overflow-y-hidden w-8/12 py-8">
                    <table className="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th></th>
                                <th>User</th>
                                <th className="rounded-tr-lg sm:rounded-tr-none">WPM</th>
                                <th className="hidden rounded-tr-lg md:rounded-tr-none sm:table-cell">Accuracy</th>
                                <th className="hidden md:table-cell">Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tests?.map((test, index) => {
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
                                        <td className={`${index + 1 == tests.length ? "rounded-br-lg sm:rounded-br-none" : ""}`}>{test.speed.toFixed(2)}</td>
                                        <td className={`${index + 1 == tests.length ? "rounded-br-lg md:rounded-br-none" : ""} hidden sm:table-cell`}>{test.accuracy.toFixed(2)} %</td>
                                        <td className="hidden md:table-cell">{test.createdAt.toLocaleDateString()}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    )
}

export default Leadboard;