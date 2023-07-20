import { type NextPage } from "next"
import { useState, useEffect } from "react"
import { TestModes, TestSubModes } from "~/components/typer/types"
import type { SingleValue } from 'react-select'
import Select from 'react-select'
import Scores from "~/components/scores/Scores"

type Option = { label: string, value: number | string }

const Leaderboard: NextPage = () => {
    const [language, setLanguage] = useState<string>("english")
    const [date, setDate] = useState<Date | undefined>(undefined)
    const [timeRange, setTimeRange] = useState(0)
    const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
    const [count, setCount] = useState(15)

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
            <div id="leaderboard" className="flex w-full h-full justify-center">
                <div className="flex flex-col overflow-x-auto overflow-y-hidden w-11/12 mx-4 py-8 gap-2">
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
                    <Scores mode={TestModes.normal} subMode={subMode} count={count} date={date} language={language} />
                </div>
            </div>
        </>
    )
}

export default Leaderboard;