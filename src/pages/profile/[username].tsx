import { Typography } from "@mui/material";
import { NextPage } from "next";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Select from 'react-select'
import { SingleValue } from "react-select";
import { Activity } from "~/components/profile/activity/Activity";
import { Stats } from "~/components/profile/stats/Stats";
import Scores from "~/components/scores/Scores";
import { TestModes, TestSubModes } from "~/components/typer/types";
import { api } from "~/utils/api";

type Option = { label: string, value: number | string }

const ProfilePage: NextPage = () => {
    const router = useRouter()
    const username = router.query?.username?.toString() ?? ""
    const { data, isLoading } = api.user.getProfileByUsername.useQuery({
        username,
    });

    const [language, setLanguage] = useState<string>("english")
    const [date, setDate] = useState<Date | undefined>(undefined)
    const [timeRange, setTimeRange] = useState(3)
    const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
    const [count, setCount] = useState(15)
    const [update, setUpdate] = useState(false)

    const languageOptions = [
        { value: "english", label: 'English' },
        { value: "french", label: 'French' },
        { value: "Hindi", label: 'Hindi' },
        { value: "Chinese", label: 'Chinese' },
        { value: "Spanish", label: 'Spanish' },
    ]
    const handleChangeLanguage = (value: SingleValue<Option>) => {
        if (value) {
            setLanguage(value.value as string)
        }
    }

    const timeRangeOptions = [
        { value: 0, label: 'Daily' },
        { value: 1, label: 'Weekly' },
        { value: 2, label: 'Monthly' },
        { value: 3, label: 'All Time' },
    ]
    const handleChangeTimeRange = (value: SingleValue<Option>) => {
        if (value) {
            setTimeRange(value.value as number)
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

            setSubMode(value.value as number)
        }
    }

    const wordsCountOptions = [
        { value: 10, label: '10' },
        { value: 25, label: '25' },
        { value: 50, label: '50' },
        { value: 100, label: '100' },
    ]
    const handleChangeCount = (value: SingleValue<Option>) => {
        if (value) setCount(value.value as number)
    }

    return (
        <>
            <div className="flex justify-stretch flex-col w-full h-full overflow-auto overflow-x-hidden items-center">
                <div className="flex w-11/12 space-x-4 mt-8 mx-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center justify-center">
                                <div className="avatar">
                                    <div className="mask mask-circle w-24 h-24">
                                        {data?.image ?
                                            <Image width={500} height={500} src={data?.image ?? ""} alt={"Profile Picture"} />
                                            :
                                            <div className="avatar placeholder">
                                                <div className="bg-neutral text-neutral-content rounded-full w-24">
                                                    <span className="text-4xl font-bold">{data?.username?.charAt(0).toUpperCase() ?? ""}</span>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col justify-center gap-1">
                                {isLoading ?
                                    <div className="flex basis-0 grow items-center">
                                        <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                    </div>
                                    :
                                    <>
                                        <p className="text-sm md:text-xl"><strong>{data?.username ?? ""}</strong></p>
                                        <p className="text-xs md:text-lg">{data?.bio ?? ""}</p>
                                        <p className="cursor-pointer text-xs md:text-lg"><a href={data?.link ?? ""}>{data?.link ?? ""}</a></p>
                                    </>
                                }
                            </div>
                        </div>
                    </div>
                </div>
                <div className="divider mb-4 mx-8 mt-3"></div>
                <div className="flex basis-0 grow items-stretch w-11/12">
                    <div className="flex basis-0 grow justify-stretch flex-col 2xl:items-center w-full">
                        <div className="flex w-full gap-4 flex-col">
                            <div className="flex flex-col">
                                <Typography variant="h5" className="my-2"><strong>Stats</strong></Typography>
                                <Stats profile={data} />
                            </div>
                            <div className="hidden flex-col md:flex">
                                <Typography variant="h5" className="my-2"><strong>Activity</strong></Typography>
                                <Activity profile={data} />
                            </div>
                        </div>
                        <div className="flex basis-0 grow justify-stretch flex-col overflow-x-auto overflow-y-auto min-h-[532px] w-full py-4 gap-2">
                            <Typography variant="h5" className="my-2"><strong>Best Scores</strong></Typography>
                            <div className="flex gap-2">
                                <Select
                                    instanceId="languageSeelect"
                                    defaultValue={languageOptions[0]}
                                    options={languageOptions}
                                    value={languageOptions.find(option => option.value == language)}
                                    onChange={handleChangeLanguage}
                                    isSearchable={false}
                                    className="max-w-xs my-react-select-container"
                                    classNamePrefix="my-react-select"
                                />
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
                            <Scores update={update} userId={data?.id} mode={TestModes.normal} subMode={subMode} count={count} date={date} language={language} />
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
};

export default ProfilePage;