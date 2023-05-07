import type { Colors } from "./colorPresets"

interface Props {
    name: string,
    preset: Colors,
    hoverStyle: string,
    setColors: (preset: Colors, name: string) => void
}

export const PresetButton = ({ name, preset, hoverStyle, setColors }: Props) => {

    return (
        <button style={{ 
            backgroundColor: preset["--b1"], 
            borderColor: preset["--n"], 
            color: preset["--bc"],
        }} className={`btn flex flex-col w-28 sm:w-44 md:w-48 !h-[unset] border rounded-md px-4 py-2 my-1 ${hoverStyle}`} 
            onClick={() => {setColors(preset, "")}}
        >
            <h2 className="uppercase font-bold">{name}</h2>
            <div className="flex">
                <div style={{backgroundColor: preset["--p"]}} className="aspect-square w-5 rounded-md border" />
                <div style={{backgroundColor: preset["--s"]}} className="aspect-square w-5 rounded-md border" />
                <div style={{backgroundColor: preset["--n"]}} className="aspect-square w-5 rounded-md border" />
            </div>
        </button>
    )
}