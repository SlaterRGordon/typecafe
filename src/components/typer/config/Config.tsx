import { useEffect } from "react"
import type { SingleValue } from "react-select"
import Select from 'react-select'
import { TestModes, TestSubModes } from "../types"
import { ConfigOption } from "./ConfigOption"

interface ConfigProps {
    language: string,
    setLanguage: (newLanguage: string) => void,
    mode: TestModes,
    setMode: (newMode: TestModes) => void,
    subMode: TestSubModes,
    setSubMode: (newSubMode: TestSubModes) => void,
    count: number,
    setCount: (newCount: number) => void,
    showStats: boolean,
    setShowStats: (show: boolean) => void,
}

type Option = { label: string, value: string }

export const Config = (props: ConfigProps) => {

    const handleSubModeChange = (newSubMode: number) => {
        props.setSubMode(newSubMode)
        props.setCount(newSubMode == TestSubModes.timed ? 15 : 10)
    }

    const languageOptions = [
        { value: "english", label: 'English' },
        { value: "french", label: 'French' },
        { value: "hindi", label: 'Hindi' },
        { value: "chinese", label: 'Chinese' },
        { value: "spanish", label: 'Spanish' },
    ]
    const handleChangeLanguage = (value: SingleValue<Option>) => {
        if (value) props.setLanguage(value.value)
    }

    useEffect(() => {
        document.addEventListener("click", (e) => {
            const target = e.target as HTMLDivElement
            if (target.id.startsWith("react-select-languageSelect-option-")) {
                e.preventDefault()
            }
        })
    }, [])

    return (
        <div className="flex flex-col h-full justify-between">
            <h3 className="font-bold text-4xl py-1">Settings</h3>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Languages</h3>
                <Select
                    instanceId="languageSelect"
                    defaultValue={languageOptions[0]}
                    options={languageOptions}
                    value={languageOptions.filter(option => option.value == props.language)[0]}
                    onChange={handleChangeLanguage}
                    isSearchable={false}
                    className="max-w-xs my-react-select-container"
                    classNamePrefix="my-react-select"
                    menuPosition="fixed"
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Modes</h3>
                <ConfigOption
                    // options={["Normal", "nGram", "Paced"]}
                    options={["Normal",]}
                    active={props.mode}
                    onChange={(newMode: string | number) => { props.setMode(newMode as TestModes) }}
                />
            </div>
            {props.mode == TestModes.normal &&
                <>
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-2xl py-1">Type</h3>
                        <ConfigOption
                            options={["Timed", "Words"]}
                            active={props.subMode}
                            onChange={(newSubMode: string | number) => { handleSubModeChange(newSubMode as TestSubModes) }}
                        />
                    </div>
                    {props.subMode == TestSubModes.timed &&
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Time</h3>
                            <ConfigOption
                                options={["15s", "30s", "60s", "120s"]}
                                values={[15, 30, 60, 120]}
                                active={props.count}
                                onChange={(newCount: string | number) => { props.setCount(newCount as number) }}
                            />
                        </div>
                    }
                    {props.subMode == TestSubModes.words &&
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Words</h3>
                            <ConfigOption
                                options={["10", "25", "50", "100"]}
                                values={[10, 25, 50, 100]}
                                active={props.count}
                                onChange={(newCount: string | number) => { props.setCount(newCount as number) }}
                            />
                        </div>
                    }
                </>
            }
            {/* {
                props.mode == TestModes.ngrams &&
                <div>
                    <h3 className="font-bold text-2xl">N-Grams</h3>
                </div>
            }
            {
                props.mode == TestModes.pace &&
                <div>
                    <h3 className="font-bold text-2xl">Paced</h3>
                </div>
            } */}
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Live Stats</h3>
                <ConfigOption
                    options={["off", "on"]}
                    active={props.showStats ? 1 : 0}
                    onChange={(newShowStats: string | number) => { props.setShowStats(newShowStats == 1 ? true : false) }}
                />
            </div>
        </div>
    )
}
