import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { SingleValue } from "react-select"
import Select from 'react-select'
import { TestModes, TestSubModes, TestGramScopes } from "../types"
import type { TestGramSources } from "../types"
import { ConfigOption, ConfigToggle, SegmentedGroup, segmentClass } from "./ConfigOption"

interface ConfigProps {
    language: string,
    setLanguage: (newLanguage: string) => void,
    mode: TestModes,
    setMode: (newMode: TestModes) => void,
    subMode: TestSubModes,
    setSubMode: (newSubMode: TestSubModes) => void,
    selectedKeys: string[],
    setSelectedKeys: (newSelectedKeys: string[]) => void,
    count: number,
    setCount: (newCount: number) => void,
    customLength: boolean,
    setCustomLength: (value: boolean) => void,
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
    punctuation: boolean,
    setPunctuation: (value: boolean) => void,
    capitals: boolean,
    setCapitals: (value: boolean) => void,
    showStats: boolean,
    setShowStats: (show: boolean) => void,
    showKeyboard: boolean,
    setShowKeyboard: (show: boolean) => void,
}

type Option = { label: string, value: string }

const SettingRow = ({ label, description, children }: { label: string, description?: string, children: ReactNode }) => (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full shrink-0 sm:w-52">
            <h3 className="text-lg font-bold leading-tight sm:text-xl">{label}</h3>
            {description &&
                <p className="mt-0.5 text-sm text-base-content/45">{description}</p>
            }
        </div>
        <div className="w-full min-w-0 sm:flex-1">{children}</div>
    </div>
)

const SettingDivider = () => <div className="h-px w-full bg-base-content/10" />

export const Config = (props: ConfigProps) => {
    const handleModeChange = (newMode: number) => {
        props.setMode(newMode)
        if (newMode !== TestModes.normal) {
            props.setSubMode(TestSubModes.words)
            props.setCount(10)
            props.setCustomLength(false)
        }
    }

    const handleSubModeChange = (newSubMode: number) => {
        props.setCount(newSubMode == TestSubModes.timed ? 15 : 10)
        props.setCustomLength(false)
        props.setSubMode(newSubMode)
    }

    const lengthPresets = props.subMode == TestSubModes.timed
        ? [{ value: 15, label: "15s" }, { value: 30, label: "30s" }, { value: 60, label: "60s" }, { value: 120, label: "120s" }]
        : [{ value: 10, label: "10" }, { value: 25, label: "25" }, { value: 50, label: "50" }, { value: 100, label: "100" }]

    const lengthMax = props.subMode == TestSubModes.timed ? 3600 : 5000

    // Local text state so the input can be cleared and freely retyped; `count`
    // only ever holds a valid clamped number.
    const [customLengthText, setCustomLengthText] = useState(String(props.count))

    const handleSelectLength = (value: number) => {
        props.setCustomLength(false)
        props.setCount(value)
    }

    const handleSelectCustomLength = () => {
        setCustomLengthText(String(props.count))
        props.setCustomLength(true)
    }

    const handleCustomLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCustomLengthText(e.target.value)
        const parsed = parseInt(e.target.value, 10)
        if (!Number.isNaN(parsed)) {
            props.setCount(Math.min(Math.max(parsed, 1), lengthMax))
        }
    }

    const handleCustomLengthBlur = () => {
        const normalized = Math.min(Math.max(props.count, 1), lengthMax)
        props.setCount(normalized)
        setCustomLengthText(String(normalized))
        // If a custom value matches a preset, snap back to that preset button
        // (and treat the run as ranked again).
        if (lengthPresets.some((preset) => preset.value === normalized)) {
            props.setCustomLength(false)
        }
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
        { value: "spanish", label: 'Spanish' },
    ]
    const handleChangeLanguage = (value: SingleValue<Option>) => {
        if (value) props.setLanguage(value.value)
    }

    useEffect(() => {
        const handleSelectOptionClick = (e: MouseEvent) => {
            const target = e.target as HTMLDivElement
            if (target.id.startsWith("react-select-languageSelect-option-")) {
                e.preventDefault()
            }
        }
        document.addEventListener("click", handleSelectOptionClick)
        return () => document.removeEventListener("click", handleSelectOptionClick)
    }, [])

    const getEnumValues = <T extends object>(enumObj: T): (T[keyof T])[] => {
        return Object.values(enumObj).filter(value => typeof value === 'number') as (T[keyof T])[];
    };

    return (
        <div className="flex flex-col mb-8">
            <h3 className="font-mono font-bold text-4xl pb-4 tracking-tight">Settings</h3>

            <SettingRow label="Mode" description="Choose your typing mode">
                <ConfigOption
                    variant="pill"
                    options={["Normal", "Practice", "Grams", "Relaxed"]}
                    active={props.mode}
                    onChange={(newMode: string | number) => { handleModeChange(newMode as TestModes) }}
                />
            </SettingRow>

            <SettingDivider />

            {props.mode === TestModes.normal &&
                <>
                    <SettingRow label="Language" description="Select your preferred language">
                        <Select
                            instanceId="languageSelect"
                            defaultValue={languageOptions[0]}
                            options={languageOptions}
                            value={languageOptions.filter(option => option.value == props.language)[0]}
                            onChange={handleChangeLanguage}
                            isSearchable={false}
                            className="w-full my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                    </SettingRow>
                    <SettingRow label="Type" description="What you want to practice">
                        <ConfigOption
                            variant="pill"
                            options={["Timed", "Words"]}
                            active={props.subMode}
                            onChange={(newSubMode: string | number) => { handleSubModeChange(newSubMode as TestSubModes) }}
                        />
                    </SettingRow>
                    <SettingRow label="Length" description={props.subMode == TestSubModes.timed ? "Set the test length (seconds)" : "Set the test length (words)"}>
                        <div className="flex w-full flex-col gap-2">
                            <SegmentedGroup>
                                {lengthPresets.map((preset) => (
                                    <button
                                        key={preset.value}
                                        onClick={() => handleSelectLength(preset.value)}
                                        className={segmentClass(!props.customLength && props.count === preset.value)}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <button onClick={handleSelectCustomLength} className={segmentClass(props.customLength)}>
                                    Custom
                                </button>
                            </SegmentedGroup>
                            {props.customLength &&
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="customLengthInput"
                                            type="number"
                                            min={1}
                                            max={lengthMax}
                                            className="w-full input input-bordered input-sm"
                                            value={customLengthText}
                                            onChange={handleCustomLengthChange}
                                            onBlur={handleCustomLengthBlur}
                                        />
                                        <span className="shrink-0 text-sm text-base-content/55">
                                            {props.subMode == TestSubModes.timed ? "seconds" : "words"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-warning">Custom lengths aren&apos;t ranked on the leaderboard.</p>
                                </div>
                            }
                        </div>
                    </SettingRow>
                    <SettingDivider />
                </>
            }
            {props.mode === TestModes.ngrams &&
                <>
                    <SettingRow label="Source" description="Where the grams come from">
                        <ConfigOption
                            variant="pill"
                            options={["Bigrams", "Trigrams", "Tetragrams", "Words"]}
                            active={props.gramSource}
                            onChange={(newTestGramSource: string | number) => { handleTestGramSourceChange(newTestGramSource as TestGramSources) }}
                        />
                    </SettingRow>
                    <SettingRow label="Scope" description="How many top grams to draw from">
                        <ConfigOption
                            variant="pill"
                            options={getEnumValues(TestGramScopes).map(scope => 'Top ' + scope.toString())}
                            values={getEnumValues(TestGramScopes)}
                            active={props.gramScope.toString()}
                            onChange={(newGramScope: string | number) => { handleTestGramScopeChange(Number(newGramScope)) }}
                        />
                    </SettingRow>
                    <SettingRow label="Combinations" description="Grams shown per level">
                        <input
                            id="testGramCombinationInput"
                            type="number"
                            className={`w-28 input input-bordered input-sm`}
                            value={props.gramCombination}
                            onChange={handleTestGramCombinationChange}
                        />
                    </SettingRow>
                    <SettingRow label="Repetitions" description="Times each level repeats">
                        <input
                            id="testGramRepetitionInput"
                            type="number"
                            className={`w-28 input input-bordered input-sm`}
                            value={props.gramRepetition}
                            onChange={handleTestGramRepetitionChange}
                        />
                    </SettingRow>
                    <SettingRow label="WPM threshold" description="Speed needed to advance">
                        <input
                            id="testGramWpmThresholdInput"
                            type="number"
                            className={`w-28 input input-bordered input-sm`}
                            value={props.gramWpmThreshold}
                            onChange={handleTestGramWpmThresholdChange}
                        />
                    </SettingRow>
                    <SettingRow label="Accuracy threshold" description="Accuracy needed to advance">
                        <input
                            id="testGramAccuracyThresholdInput"
                            type="number"
                            className={`w-28 input input-bordered input-sm`}
                            value={props.gramAccuracyThreshold}
                            onChange={handleTestGramAccuracyThresholdChange}
                        />
                    </SettingRow>
                    <SettingDivider />
                </>
            }
            {props.mode !== TestModes.ngrams &&
                <>
                    <SettingRow label="Text" description="Choose text content">
                        <SegmentedGroup>
                            <ConfigToggle label="punctuation" active={props.punctuation} onChange={props.setPunctuation} />
                            <ConfigToggle label="capitals" active={props.capitals} onChange={props.setCapitals} />
                        </SegmentedGroup>
                    </SettingRow>
                    <SettingDivider />
                </>
            }

            <SettingRow label="Live stats" description="Show real-time performance">
                <ConfigOption
                    variant="pill"
                    options={["off", "on"]}
                    active={props.showStats ? 1 : 0}
                    onChange={(newShowStats: string | number) => { props.setShowStats(newShowStats == 1 ? true : false) }}
                />
            </SettingRow>
            {props.mode !== TestModes.practice &&
                <SettingRow label="Keyboard" description="Use on-screen keyboard">
                    <ConfigOption
                        variant="pill"
                        options={["off", "on"]}
                        active={props.showKeyboard ? 1 : 0}
                        onChange={(newShowKeyboard: string | number) => { props.setShowKeyboard(newShowKeyboard == 1 ? true : false) }}
                    />
                </SettingRow>
            }
        </div>
    )
}
