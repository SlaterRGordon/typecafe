

interface Colors {
    "--b1": string,
    "--bc": string,
    "--p": string,
    "--s": string,
}

interface Props {
    name: string,
    color: string,
    colorKey: keyof Colors,
    togglePopover: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>, key: keyof Colors) => void
}

export const ColorButton = ({ name, color, colorKey, togglePopover }: Props) => {

    return (
        <div className="flex flex-col w-6/12">
            <h3 className="flex items-center text-xl">{name}</h3>
            <div className="flex space-x-2">
                {color == "" ?
                    <button onClick={(e) => togglePopover(e, colorKey)} className={`btn btn-square btn-outline btn-sm`} />
                    :
                    <button onClick={(e) => togglePopover(e, colorKey)} style={{ backgroundColor: color }} className={`btn btn-square btn-outline btn-sm`} />
                }
                <h2 className="flex items-center font-bold">{color}</h2>
            </div>
        </div>
    )
}