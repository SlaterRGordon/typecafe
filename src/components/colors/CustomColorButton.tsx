import { api } from "~/utils/api"
import type { Colors } from "./colorPresets"

interface Props {
    name: string,
    preset: Colors,
    id: string,
    setColors: (preset: Colors, name: string) => void,
    refetch: () => void}

export const CustomColorButton = ({ name, preset, id, setColors, refetch }: Props) => {
    const deleteColorConfiguration = api.color.delete.useMutation({
        onSuccess: () => {
            void refetch();
        },
    })

    const deleteColors = () => {
        deleteColorConfiguration.mutate({id: id})
    }

    return (
        <button style={{
            backgroundColor: preset["--b1"],
            borderColor: preset["--n"],
            color: preset["--bc"],
        }} className={`relative btn flex flex-col w-44 !h-[unset] border rounded-md px-4 py-2 my-1 hover:shadow-lg hover:opacity-70`}
            onClick={() => { setColors(preset, name) }}
        >
            <h2 className="uppercase font-bold">{name}</h2>
            <div className="flex">
                <div style={{ backgroundColor: preset["--p"] }} className="aspect-square w-5 rounded-md border" />
                <div style={{ backgroundColor: preset["--s"] }} className="aspect-square w-5 rounded-md border" />
                <div style={{ backgroundColor: preset["--n"] }} className="aspect-square w-5 rounded-md border" />
            </div>
            <div className="flex absolute top-0 right-0">
                <button className="btn btn-ghost btn-circle btn-sm" onClick={deleteColors}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7 21q-.825 0-1.413-.588T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.588 1.413T17 21H7Zm2-4h2V8H9v9Zm4 0h2V8h-2v9Z" /></svg>
                </button>
            </div>
        </button>
    )
}