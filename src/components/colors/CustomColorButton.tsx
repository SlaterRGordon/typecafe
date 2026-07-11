import { api } from "~/utils/api"
import type { Colors } from "./colorPresets"

interface Props {
    name: string,
    preset: Colors,
    id: string,
    setColors: (preset: Colors, name: string) => void,
    refetch: () => void
}

export const CustomColorButton = ({ name, preset, id, setColors, refetch }: Props) => {
    const deleteColorConfiguration = api.color.delete.useMutation({
        onSuccess: () => void refetch(),
    })

    return (
        <div className="relative">
            <button
                type="button"
                style={{ backgroundColor: preset["--b1"], color: preset["--bc"] }}
                className="btn flex min-h-11 w-full flex-col !h-[unset] rounded-md border px-4 py-2 hover:shadow-lg hover:opacity-70"
                onClick={() => setColors(preset, name)}
                title={`Apply ${name} color theme`}
                aria-label={`Apply ${name} color theme`}
            >
                <span className="uppercase font-bold">{name}</span>
                <span className="flex">
                    <span style={{ backgroundColor: preset["--p"] }} className="aspect-square w-5 rounded-md border" />
                    <span style={{ backgroundColor: preset["--s"] }} className="aspect-square w-5 rounded-md border" />
                </span>
            </button>
            <button
                type="button"
                className="btn btn-ghost btn-circle absolute right-0 top-0 min-h-11 min-w-11"
                onClick={() => deleteColorConfiguration.mutate({ id })}
                aria-label={`Delete ${name} color theme`}
                title={`Delete ${name} color theme`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M7 21q-.825 0-1.413-.588T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.588 1.413T17,21H7Zm2-4h2V8H9v9Zm4,0h2V8h-2v9Z" /></svg>
            </button>
        </div>
    )
}
