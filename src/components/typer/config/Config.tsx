import { useEffect } from "react"
import type { SingleValue } from "react-select"
import Select from 'react-select'
import { TestModes, TestSubModes, TestGramSources, TestGramScopes } from "../types"
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
    gramSource: TestGramSources,
    setGramSource: (newTestGramSource: TestGramSources) => void,
    gramScope: TestGramScopes,
    setGramScope: (newTestGramScope: TestGramScopes) => void,
    gramCombination: number,
    setGramCombination: (newTestGramRepetition: number) => void,
    gramRepetition: number,
    setGramRepetition: (newTestGramRepetition: number) => void,
    gramWpmThreshold: number,
    setGramWpmThreshold: (newTestGramWpmThreshold: number) => void,
    gramAccuracyThreshold: number,
    setGramAccuracyThreshold: (newTestGramAccuracyThreshold: number) => void,
    showStats: boolean,
    setShowStats: (show: boolean) => void,
    showKeyboard: boolean,
    setShowKeyboard: (show: boolean) => void,
}

type Option = { label: string, value: string }

export const Config = (props: ConfigProps) => {
    const handleModeChange = (newMode: number) => {
        props.setMode(newMode)
        if (newMode !== TestModes.normal) {
            props.setSubMode(TestSubModes.words)
            props.setCount(10)
        }
    }

    const handleSubModeChange = (newSubMode: number) => {
        props.setCount(newSubMode == TestSubModes.timed ? 15 : 10)
        props.setSubMode(newSubMode)
    }

    const handleTestGramSourceChange = (newTestGramSource: number) => {
        props.setGramSource(newTestGramSource)
    }

    const handleTestGramScopeChange = (newGramScope: string | number) => {
        props.setGramScope(newGramScope as TestGramScopes);
    };

    const handleTestGramCombinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCombination = parseInt(e.target.value)
        if (newCombination < 1) {
            props.setGramCombination(1)
            return
        }

        if (newCombination > props.gramScope) {
            props.setGramCombination(props.gramScope)
            return
        }

        props.setGramCombination(newCombination)
    }

    const handleTestGramRepetitionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newRepetition = parseInt(e.target.value)
        if (newRepetition < 0) return

        props.setGramRepetition(newRepetition)
    }

    const handleTestGramWpmThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newWpmThreshold = parseInt(e.target.value)
        if (newWpmThreshold < 0) return

        props.setGramWpmThreshold(newWpmThreshold)
    }

    const handleTestGramAccuracyThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAccuracyThreshold = parseInt(e.target.value)
        if (newAccuracyThreshold < 0) {
            props.setGramAccuracyThreshold(0)
            return
        }
        if (newAccuracyThreshold > 100) {
            props.setGramAccuracyThreshold(100)
            return
        }

        props.setGramAccuracyThreshold(newAccuracyThreshold)
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

    const getEnumValues = <T extends object>(enumObj: T): (T[keyof T])[] => {
        return Object.values(enumObj).filter(value => typeof value === 'number') as (T[keyof T])[];
    };

    return (
        <div className="flex flex-col h-full justify-between mb-8 gap-2">
            <h3 className="font-bold text-4xl py-1">Settings</h3>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Modes</h3>
                <ConfigOption
                    options={["Normal", "Grams", "Relaxed"]}
                    active={props.mode}
                    onChange={(newMode: string | number) => { handleModeChange(newMode as TestModes) }}
                />
            </div>
            {props.mode == TestModes.normal &&
                <>
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
            {props.mode == TestModes.ngrams &&
                <>
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-2xl py-1">Source</h3>
                        <ConfigOption
                            options={["Bigrams", "Trigrams", "Tetragrams", "Words"]}
                            active={props.gramSource}
                            onChange={(newTestGramSource: string | number) => { handleTestGramSourceChange(newTestGramSource as TestGramSources) }}
                        />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-2xl py-1">Scope</h3>
                        <ConfigOption
                            options={getEnumValues(TestGramScopes).map(scope => 'Top ' + scope.toString())}
                            values={getEnumValues(TestGramScopes)}
                            active={props.gramScope.toString()}
                            onChange={(newGramScope: string | number) => { handleTestGramScopeChange(Number(newGramScope)) }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Combinations</h3>
                            <div className="flex gap-2">
                                <input
                                    id="testGramCombinationInput"
                                    type="number"
                                    className={`w-full input input-bordered input-sm`}
                                    value={props.gramCombination}
                                    onChange={handleTestGramCombinationChange}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Repetitions</h3>
                            <div className="flex gap-2">
                                <input
                                    id="testGramRepetitionInput"
                                    type="number"
                                    className={`w-full input input-bordered input-sm`}
                                    value={props.gramRepetition}
                                    onChange={handleTestGramRepetitionChange}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Wpm Threshold</h3>
                            <div className="flex gap-2">
                                <input
                                    id="testGramWpmThresholdInput"
                                    type="number"
                                    className={`w-full input input-bordered input-sm`}
                                    value={props.gramWpmThreshold}
                                    onChange={handleTestGramWpmThresholdChange}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-2xl py-1">Accuracy Threshold</h3>
                            <div className="flex gap-2">
                                <input
                                    id="testGramAccuracyThresholdInput"
                                    type="number"
                                    className={`w-full input input-bordered input-sm`}
                                    value={props.gramAccuracyThreshold}
                                    onChange={handleTestGramAccuracyThresholdChange}
                                />
                            </div>
                        </div>
                    </div>
                </>
            }
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Live Stats</h3>
                <ConfigOption
                    options={["off", "on"]}
                    active={props.showStats ? 1 : 0}
                    onChange={(newShowStats: string | number) => { props.setShowStats(newShowStats == 1 ? true : false) }}
                />
            </div>
            <div className="flex flex-col">
                <h3 className="font-semibold text-2xl py-1">Live Keyboard</h3>
                <ConfigOption
                    options={["off", "on"]}
                    active={props.showKeyboard ? 1 : 0}
                    onChange={(newShowKeyboard: string | number) => { props.setShowKeyboard(newShowKeyboard == 1 ? true : false) }}
                />
            </div>
        </div>
    )
}
