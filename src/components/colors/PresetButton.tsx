import type { Colors } from "./colorPresets"

interface Props {
    name: string,
    preset: Colors,
    hoverStyle: string,
    setColors: (preset: Colors) => void
}

export const PresetButton = ({ name, preset, hoverStyle, setColors }: Props) => {

    return (
        <button style={{ 
            backgroundColor: preset["--b1"], 
            borderColor: preset["--n"], 
            color: preset["--bc"],
        }} className={`btn space-x-1 border rounded-full px-4 py-2 ${hoverStyle}`} 
            onClick={() => {setColors(preset)}}
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