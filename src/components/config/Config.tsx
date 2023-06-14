import { TestModes, TestSubModes } from "../typer/types"

interface TyperConfigProps {
    mode: TestModes,
    setMode: (newMode: TestModes) => void,
    subMode: TestSubModes,
    setSubMode: (newSubMode: TestSubModes) => void,
    count: number,
    setCount: (newCount: number) => void,
    showStats: boolean,
    setShowStats: (show: boolean) => void,
}

export const TyperConfig = (props: TyperConfigProps) => {

    return (
        <>
            <h3 className="font-bold text-3xl px-1">Modes</h3>
            <div className="tabs tabs-boxed">
                <a
                    className={`tab ${props.mode == TestModes.normal ? 'tab-active font-bold' : ''}`}
                    onClick={() => { props.setMode(TestModes.normal) }}
                >Normal</a>
                <a
                    className={`tab ${props.mode == TestModes.progression ? 'tab-active font-bold' : ''}`}
                    onClick={() => { props.setMode(TestModes.progression) }}
                >Progression</a>
                <a
                    className={`tab ${props.mode == TestModes.ngrams ? 'tab-active font-bold' : ''}`}
                    onClick={() => { props.setMode(TestModes.ngrams) }}
                >N-Grams</a>
                <a
                    className={`tab ${props.mode == TestModes.pace ? 'tab-active font-bold' : ''}`}
                    onClick={() => { props.setMode(TestModes.pace) }}
                >Pace</a>
            </div>
            {props.mode == TestModes.normal &&
                <div className="flex flex-col py-8">

                </div>
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
        </>
    )
}
