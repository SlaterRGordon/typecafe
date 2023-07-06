import { useEffect, useState, useRef } from "react"
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
        console.log("changing language")
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
        <div>  
            <h3 className="font-bold text-4xl px-1">Settings</h3>
            <h3 className="font-semibold text-2xl px-1">Languages</h3>
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
            
            <h3 className="font-semibold text-2xl px-1">Modes</h3>
            <ConfigOption
                options={["Normal", "Learn", "nGram", "Paced"]}
                active={props.mode}
                onChange={(newMode: string | number) => { props.setMode(newMode as TestModes) }}
            />
            {props.mode == TestModes.normal &&
                <>
                    <h3 className="font-semibold text-2xl px-1">Type</h3>
                    <ConfigOption
                        options={["Timed", "Words"]}
                        active={props.subMode}
                        onChange={(newSubMode: string | number) => { handleSubModeChange(newSubMode as TestSubModes) }}
                    />
                    {props.subMode == TestSubModes.timed &&
                    <>
                        <h3 className="font-semibold text-2xl px-1">Time</h3>
                        <ConfigOption
                            options={["15s", "30s", "60s", "120s"]}
                            values={[15, 30, 60, 120]}
                            active={props.count}
                            onChange={(newCount: string | number) => { props.setCount(newCount as number) }}
                        />
                    </>
                    }
                    {props.subMode == TestSubModes.words &&
                    <>
                        <h3 className="font-semibold text-2xl px-1">Words</h3>
                        <ConfigOption
                            options={["10", "25", "50", "100"]}
                            values={[10, 25, 50, 100]}
                            active={props.count}
                            onChange={(newCount: string | number) => { props.setCount(newCount as number) }}
                        />
                    </>
                    }
                </>
            }
            {props.mode == TestModes.learn &&
                <div>
                    <h3 className="font-bold text-2xl">Progression</h3>
                </div>
            }
            {
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
            }
            <h3 className="font-semibold text-2xl px-1">Live Stats</h3>
            <ConfigOption
                options={["off", "on"]}
                active={props.showStats ? 1 : 0}
                onChange={(newShowStats: string | number) => { props.setShowStats(newShowStats == 1 ? true : false) }}
            />
        </div>
    )
}
