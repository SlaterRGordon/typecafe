import { type NextPage } from "next";
import { useEffect, useState } from "react";
import { Typer } from "~/components/typer/Typer";
import { TestGramScopes, TestGramSources, TestModes, TestSubModes } from "~/components/typer/types";
import type { Difficulty, Level } from "~/components/typer/learn/levels";
import { levels } from "~/components/typer/learn/levels";
import { api } from "~/utils/api";
import Select from 'react-select'
import type { SingleValue } from "react-select";

type Option = { label: string, value: number | string, isDisabled: boolean }
const letters = "qwertyuiopasdfghjklzxcvbnm/"

const Learn: NextPage = () => {
    const [language, setLanguage] = useState<string>("english")
    const [mode, setMode] = useState<TestModes>(TestModes.normal)
    const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.words)
    const [gramSource, setGramSource] = useState<TestGramSources>(TestGramSources.bigrams)
    const [gramScope, setGramScope] = useState<TestGramScopes>(TestGramScopes.fifty)
    const [gramCombination, setGramCombination] = useState<number>(1)
    const [gramRepetition, setGramRepetition] = useState<number>(0)
    const [count, setCount] = useState(15)
    const [difficulty, setDifficulty] = useState("easy")
    const [level, setLevel] = useState<Level>(levels[0] as Level)
    const [currentKey, setCurrentKey] = useState<string>("")
    const [levelChanged, setLevelChanged] = useState<boolean>(false)

    // fetch types
    const { data: testType } = api.type.get.useQuery({ mode, subMode, language: language })
    const { data: tests, refetch: refetchTests,  isLoading: isLoadingTests } = api.test.getByLevels.useQuery({
        typeId: testType ? testType.id : "",
    })

    useEffect(() => {
        if (tests && !isLoadingTests) {

        }
    }, [tests, isLoadingTests])

    const difficultyOptions = [
        { value: "easy", label: 'Easy' },
        { value: "medium", label: 'Medium' },
        { value: "hard", label: 'Hard' },
    ]
    const handleChangeDifficulty = (value: SingleValue<{ value: string, label: string }>) => {
        if (value) {
            setDifficulty(value.value)
            setLevelChanged(false)
        }
    }

    const levelOptions: Option[] = levels.map((level: Level, index: number, array: Level[]) => {
        if (level.name == "Level 1") return { value: level.name, label: level.name, isDisabled: false } as Option

        const levelTest = tests?.find(test => test.options == array[index - 1]?.name)
        const speedToBeat = level[difficulty as "easy" | "medium" | "hard"]["wpm"]

        if (levelTest && levelTest.speed > speedToBeat) {
            return { value: level.name, label: level.name, isDisabled: false } as Option
        }

        return { value: level.name, label: level.name, isDisabled: true } as Option
    })

    const handleChangeLevel = (value: SingleValue<Option>) => {
        if (value && !value.isDisabled) {
            const level = levels.find(level => level.name == value.value)
            if (level) setLevel(level)
            setLevelChanged(true)
        }
    }

    const onKeyChange = (key: string) => {
        setCurrentKey(key)
    }

    const onTestComplete = () => {
        refetchTests().then(() => {
            // console.log("tests refetched")
            setLevelChanged(false)
        }).catch((error) => {
            console.log(error)
        })
    }
    
    useEffect(() => {
        if (!levelChanged) {
            const levelIndex = levelOptions.findIndex(levelOption => levelOption.isDisabled == true) - 1
            setLevel(levels[levelIndex] as Level)
        }
    }, [levelOptions, levelChanged])

    return (
        <div className="relative flex flex-col w-full h-full justify-center">
            <div className="absolute top-0 flex flex-col w-full items-center gap-4 px-8 py-12">
                <div className="flex w-full">
                    <div className="flex w-6/12 gap-2">
                        <Select
                            instanceId="difficultySelect"
                            defaultValue={difficultyOptions[0]}
                            options={difficultyOptions}
                            value={difficultyOptions.find(option => option.value == difficulty)}
                            onChange={handleChangeDifficulty}
                            isSearchable={false}
                            className="my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                        <Select
                            instanceId="levelSelect"
                            defaultValue={levelOptions[0]}
                            options={levelOptions}
                            value={levelOptions.find(option => option.value == level.name)}
                            onChange={handleChangeLevel}
                            formatOptionLabel={(option) => {
                                if (option.isDisabled) {
                                    return (
                                        <div className="flex justify-between">
                                            <div>{option.label}</div>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                                        </div>
                                    )
                                }
                                return <div>{option.label}</div>
                            }}
                            isSearchable={false}
                            className="my-react-select-container"
                            classNamePrefix="my-react-select"
                        />
                    </div>
                </div>
                <div className="flex w-full basis-0 grow justify-start items-center gap-4">
                    <div className="text-lg"><strong>Required Speed: {level[difficulty as "easy" | "medium" | "hard"]["wpm"]}wpm</strong></div>
                    <div className="text-lg"><strong>Required Accuracy: {level[difficulty as "easy" | "medium" | "hard"]["accuracy"]}%</strong></div>
                </div>
                <div className="flex gap-2 basis-0 grow justify-start w-full">
                        <div className="flex justify-start items-center text-lg"><strong>Target Keys:</strong></div>
                        <div className="flex justify-start items-center">{level.keys.split("").map((key, index) => {
                            return (
                                <kbd key={index} className="kbd kbd-lg">{key}</kbd>
                            )
                        })}</div>
                    </div>
            </div>
            <div className="flex w-full justify-center">
                <Typer
                    language={language}
                    mode={mode}
                    subMode={subMode}
                    gramSource={gramSource}
                    gramScope={gramScope}
                    gramCombination={gramCombination}
                    gramRepetition={gramRepetition}
                    count={level.count}
                    level={level}
                    onKeyChange={onKeyChange}
                    onTestComplete={onTestComplete}
                    showStats={true}
                    showConfig={false}
                />
            </div>
            <div className="flex flex-col w-full justify-center py-4">
                <div className="flex justify-center gap-1 my-1 w-full">
                    {letters.slice(0, 10).split("").map((key: string, index: number) => {
                        if (key == currentKey) return (
                            <kbd key={index} className="kbd kbd-lg bg-primary text-primary-content">{key}</kbd>
                        )

                        return (
                            <kbd key={index} className="kbd kbd-lg">{key}</kbd>
                        )
                    })}
                </div>
                <div className="flex justify-center gap-1 my-1 w-full">
                    {letters.slice(10, 19).split("").map((key: string, index: number) => {
                        if (key == currentKey) return (
                            <kbd key={index} className="kbd kbd-lg bg-primary text-primary-content">{key}</kbd>
                        )

                        return (
                            <kbd key={index} className="kbd kbd-lg">{key}</kbd>
                        )
                    })}
                </div>
                <div className="flex justify-center gap-1 my-1 w-full">
                    {letters.slice(19, 26).split("").map((key: string, index: number) => {
                        if (key == currentKey) return (
                            <kbd key={index} className="kbd kbd-lg bg-primary text-primary-content">{key}</kbd>
                        )

                        return (
                            <kbd key={index} className="kbd kbd-lg">{key}</kbd>
                        )
                    })}
                </div>
                <div className="flex justify-center gap-1 my-1 w-full">
                    {currentKey == " " ?
                        <kbd className="kbd kbd-lg bg-primary text-primary-content min-width-[10rem]">&nbsp;</kbd>
                        :
                        <kbd className="kbd kbd-lg min-w-[17.5rem]">&nbsp;</kbd>
                    }
                </div>
            </div>
        </div>
    );
};

export default Learn;
