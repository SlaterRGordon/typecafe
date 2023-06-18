import { TestModes, TestSubModes } from "../types"
import { ConfigOption } from "./ConfigOption"

interface ConfigProps {
    mode: TestModes,
    setMode: (newMode: TestModes) => void,
    subMode: TestSubModes,
    setSubMode: (newSubMode: TestSubModes) => void,
    count: number,
    setCount: (newCount: number) => void,
    showStats: boolean,
    setShowStats: (show: boolean) => void,
}

export const Config = (props: ConfigProps) => {

    const handleSubModeChange = (newSubMode: number) => {
        props.setSubMode(newSubMode)
        props.setCount(newSubMode == TestSubModes.timed ? 15 : 10)
    }

    return (
        <>  
            <h3 className="font-bold text-4xl px-1">Settings</h3>
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
            {props.mode == TestModes.progression &&
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
        </>
    )
}
