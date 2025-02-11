import { addAlert } from "~/state/alert/alertSlice";
import { TestModes } from "./types";
import { useDispatch } from "react-redux";

interface KeyboardProps {
    mode: TestModes,
    currentKey: string,
    selectedKeys?: string[],
    setSelectedKeys?: (keys: string[]) => void
}

const letters = "qwertyuiopasdfghjklzxcvbnm/"

export const Keyboard = (props: KeyboardProps) => {
    const { mode, currentKey, selectedKeys, setSelectedKeys} = props
        const dispatch = useDispatch()

    const handleKeyClicked = (key: string) => {
        if (!selectedKeys || !setSelectedKeys) return

        if (selectedKeys.includes(key)) {
            // Make sure at least 6 keys are selected
            if (selectedKeys.length <= 6) {
                dispatch(addAlert({ message: "Must include at least 6 keys!", type: "error" }))
                return
            }

            // Make sure at least 1 vowel and 1 consonant is selected
            if ("aeiou".includes(key) && selectedKeys.filter(k => "aeiou".includes(k)).length <= 1) {
                dispatch(addAlert({ message: "Must include at least 1 vowel!", type: "error" }))
                return
            }
            if ("bcdfghjklmnpqrstvwxyz".includes(key) && selectedKeys.filter(k => "bcdfghjklmnpqrstvwxyz".includes(k)).length <= 1) {
                dispatch(addAlert({ message: "Must include at least 1 consonant!", type: "error" }))
                return
            }

            setSelectedKeys(selectedKeys.filter(k => k != key))
        } else {
            setSelectedKeys([...selectedKeys, key])
        }
    }

    return (
        <div className="flex flex-col w-full justify-center py-4">
            <div className="flex justify-center gap-1 my-1 w-full">
                {letters.slice(0, 10).split("").map((key: string, index: number) => {
                    if (key == currentKey) return (
                        <kbd 
                            key={index} 
                            className="kbd kbd-lg bg-primary text-primary-content cursor-pointer" 
                            onClick={() => handleKeyClicked(key)}
                        >
                            {key}
                        </kbd>
                    )

                    return (
                        <kbd 
                            key={index} 
                            className={`relative kbd kbd-lg ${!selectedKeys ? '' : selectedKeys.includes(key) ? 'kbd-unlocked' :  'kbd-locked bg-base-100 text-base-content'}`}
                            onClick={() => handleKeyClicked(key)}
                        >
                            {selectedKeys && !selectedKeys.includes(key) && <div className="absolute top-0 right-0 p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                            </div>}
                            {key}
                        </kbd>
                    )
                })}
            </div>
            <div className="flex justify-center gap-1 my-1 w-full">
                {letters.slice(10, 19).split("").map((key: string, index: number) => {
                    if (key == currentKey) return (
                        <kbd 
                            key={index} 
                            className="kbd kbd-lg bg-primary text-primary-content cursor-pointer" 
                            onClick={() => handleKeyClicked(key)}
                        >
                            {key}
                        </kbd>
                    )

                    return (
                        <kbd 
                            key={index} 
                            className={`relative kbd kbd-lg ${!selectedKeys ? '' : selectedKeys.includes(key) ? 'kbd-unlocked' :  'kbd-locked bg-base-100 text-base-content'}`}
                            onClick={() => handleKeyClicked(key)}
                        >
                            {selectedKeys && !selectedKeys.includes(key) && <div className="absolute top-0 right-0 p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                            </div>}
                            {key}
                        </kbd>
                    )
                })}
            </div>
            <div className="flex justify-center gap-1 my-1 w-full">
                {letters.slice(19, 26).split("").map((key: string, index: number) => {
                    if (key == currentKey) return (
                        <kbd 
                            key={index} 
                            className="kbd kbd-lg bg-primary text-primary-content cursor-pointer" 
                            onClick={() => handleKeyClicked(key)}
                        >
                            {key}
                        </kbd>
                    )

                    return (
                        <kbd 
                            key={index} 
                            className={`relative kbd kbd-lg ${!selectedKeys ? '' : selectedKeys.includes(key) ? 'kbd-unlocked' :  'kbd-locked bg-base-100 text-base-content'}`}
                            onClick={() => handleKeyClicked(key)}
                        >
                            {selectedKeys && !selectedKeys.includes(key) && <div className="absolute top-0 right-0 p-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M6 22q-.825 0-1.413-.588T4 20V10q0-.825.588-1.413T6 8h1V6q0-2.075 1.463-3.538T12 1q2.075 0 3.538 1.463T17 6v2h1q.825 0 1.413.588T20 10v10q0 .825-.588 1.413T18 22H6Zm0-2h12V10H6v10Zm6-3q.825 0 1.413-.588T14 15q0-.825-.588-1.413T12 13q-.825 0-1.413.588T10 15q0 .825.588 1.413T12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6v2ZM6 20V10v10Z" /></svg>
                            </div>}
                            {key}
                        </kbd>
                    )
                })}
            </div>
            <div className="flex justify-center gap-1 my-1 w-full">
                {currentKey == " " ?
                    <kbd className="kbd kbd-lg bg-primary text-primary-content min-w-[17.5rem]">&nbsp;</kbd>
                    :
                    <kbd className="kbd kbd-lg min-w-[17.5rem]">&nbsp;</kbd>
                }
            </div>
        </div>
    )
}

