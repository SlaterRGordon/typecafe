interface KeyboardProps {
    currentKey: string
}

const letters = "qwertyuiopasdfghjklzxcvbnm/"

export const Keyboard = (props: KeyboardProps) => {
    const { currentKey } = props;

    return (
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
    )
}

