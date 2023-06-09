import { useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { Popover } from "./Popover";
import { getDarkerShades, hexToHsl } from "~/utils/convertColor";
import { ColorButton } from "./ColorButton";
import { presets } from "./colorPresets";
import type { Colors } from "./colorPresets";
import { PresetButton } from "./PresetButton";
import { api } from "~/utils/api";
import { useSession } from "next-auth/react";
import { CustomColorButton } from "./CustomColorButton";
import { useDispatch } from "react-redux";
import { addAlert } from "~/state/alert/alertSlice";


export const ColorModal = () => {
    const dispatch = useDispatch()

    const { data: sessionData } = useSession()

    // fetch saved colors
    const { data: savedColors, refetch: refetchSavedColors } = api.color.getByUser.useQuery()

    // create colors mutation
    const createSavedColors = api.color.create.useMutation({
        onSuccess: () => {
            void refetchSavedColors();
        },
        onError: (error) => {
            if (error.message == "\nInvalid `prisma.colorConfiguration.create()` invocation:\n\n\nUnique constraint failed on the (not available)") {
                dispatch(addAlert({ message: "Color configuration with that name already exists!", type: "error" }))
            }
        }
    })

    const saveColors = () => {
        if (name.length == 0) {
            setNameError(true)
            return
        }

        createSavedColors.mutate({
            name: name,
            background: colors["--b1"],
            text: colors["--bc"],
            primary: colors["--p"],
            secondary: colors["--s"]
        })
    }

    const [tab, setTab] = useState<"custom" | "presets">("custom")
    const [name, setName] = useState("")
    const [nameError, setNameError] = useState(false)
    const [colors, setColors] = useLocalStorage<Colors>("colors", presets.dark)
    const [currentKey, setCurrentKey] = useState<keyof Colors>("--b1")

    const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setName(e.target.value)
        if (e.target.value.length > 0) {
            setNameError(false)
        }
    }

    // convert hex to hsl and set color
    const setColor = (color: string) => {
        setColors({ ...colors, [currentKey]: color })
    }

    // set colors to a preset
    const setPreset = (preset: Colors, name: string) => {
        setName(name)
        setColors(preset)
    }

    // states to manage color picker popover
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 })
    const { width, height } = useWindowSize()

    // hook on resize to color picker close popover
    useEffect(() => {
        setIsOpen(false)
    }, [width, height])

    const togglePopover = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>, key: keyof Colors) => {
        e.stopPropagation()
        setCurrentKey(key)
        // set position to that of the button clicked
        setPosition({ left: e.currentTarget.getBoundingClientRect().left + 32, top: e.currentTarget.getBoundingClientRect().top - 204 })
        setIsOpen(isOpen => !isOpen)
    }

    // update document property on color change
    useEffect(() => {
        for (const key in colors) {
            if (colors[key as keyof Colors] != "") {
                const hsl = hexToHsl(colors[key as keyof Colors])
                document.documentElement.style.setProperty(key, hsl)
                if (key == "--b1") {
                    const darkerShades = getDarkerShades(hexToHsl(colors[key as keyof Colors]))
                    document.documentElement.style.setProperty("--b2", darkerShades[0] as string)
                    document.documentElement.style.setProperty("--b3", darkerShades[1] as string)
                    document.documentElement.style.setProperty("--n", darkerShades[3] as string)
                    document.documentElement.style.setProperty("--nf", darkerShades[3] as string)
                } else if (key == "--p" || key == "--s") {
                    const darkerShades = getDarkerShades(hexToHsl(colors[key as keyof Colors]))
                    document.documentElement.style.setProperty(`${key}f`, darkerShades[3] as string)
                    const lightness = hsl.split(" ")[2]?.slice(0, -1)
                    if (parseFloat(lightness as string) < 50) document.documentElement.style.setProperty(`${key}c`, "0 0% 100%")
                    else document.documentElement.style.setProperty(`${key}c`, "0 0% 0%")
                }
            }
        }
    }, [colors, setColors])

    return (
        <>
            <input type="checkbox" id="colorModal" className="modal-toggle" />
            <label htmlFor="colorModal" className="modal modal-bottom sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box !w-[640px] !max-w-5xl space-y-2 !overflow-y-visible overflow-x-hidden">
                    <div className="tabs tabs-boxed">
                        <a
                            className={`tab ${tab == "custom" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("custom") }}
                        >Saved</a>
                        <a
                            className={`tab ${tab == "presets" ? 'tab-active' : ''}`}
                            onClick={() => { setTab("presets") }}
                        >Presets</a>
                    </div>
                    {tab == "custom" &&
                        <div>
                            <h3 className="font-bold text-2xl">Saved Colors</h3>
                            {sessionData?.user?.id ?
                                <div className="flex space-x-1">
                                    {savedColors?.map((colorConfiguration) => {
                                        const colors: Colors = {
                                            "--b1": colorConfiguration.background,
                                            "--bc": colorConfiguration.text,
                                            "--p": colorConfiguration.primary,
                                            "--s": colorConfiguration.secondary
                                        }

                                        return <CustomColorButton key={colorConfiguration.id} id={colorConfiguration.id} name={colorConfiguration.name} preset={colors} setColors={setPreset} refetch={refetchSavedColors} />
                                    })}
                                    {savedColors?.length == 0 && <h2 className="text-xl">No saved colors yet</h2>}
                                </div>
                                :
                                <>
                                    <h2 className="text-xl">Please log in to see saved colors</h2>
                                </>
                            }
                        </div>
                    }
                    {tab == "presets" &&
                        <div>
                            <h3 className="font-bold text-2xl">Color Presets</h3>
                            <div className="flex gap-1 flex-wrap">
                                <PresetButton name="Retro" preset={presets.retro} hoverStyle="hover:!bg-retro" setColors={setPreset} />
                                <PresetButton name="Valentine" preset={presets.valentine} hoverStyle="hover:!bg-valentine" setColors={setPreset} />
                                <PresetButton name="Cyberpunk" preset={presets.cyberpunk} hoverStyle="hover:!bg-cyberpunk" setColors={setPreset} />
                                <PresetButton name="Aqua" preset={presets.aqua} hoverStyle="hover:!bg-aqua" setColors={setPreset} />
                                <PresetButton name="Dracula" preset={presets.dracula} hoverStyle="hover:!bg-dracula" setColors={setPreset} />
                                <PresetButton name="Pastel" preset={presets.pastel} hoverStyle="hover:!bg-pastel" setColors={setPreset} />
                            </div>
                        </div>
                    }
                    <div>
                        <h3 className="font-bold text-2xl">Color Configuration</h3>
                        {sessionData?.user?.id &&
                            <div className="flex flex-col mb-1">
                                <h3 className="flex items-center text-xl">Name</h3>
                                <div className="flex space-x-2">
                                    <input type="text" placeholder="Name" className={`input input-sm input-bordered max-w-xs ${nameError ? "input-error" : ""}`} value={name} onChange={onNameChange} />
                                </div>
                            </div>
                        }
                        <div className="flex gap-1 flex-wrap">
                            <ColorButton name="Background" color={colors["--b1"]} colorKey={"--b1"} togglePopover={togglePopover} />
                            <ColorButton name="Text" color={colors["--bc"]} colorKey={"--bc"} togglePopover={togglePopover} />
                            <ColorButton name="Primary" color={colors["--p"]} colorKey={"--p"} togglePopover={togglePopover} />
                            <ColorButton name="Secondary" color={colors["--s"]} colorKey={"--s"} togglePopover={togglePopover} />
                            <ColorButton name="Neutral" color={colors["--n"]} colorKey={"--n"} togglePopover={togglePopover} />
                        </div>

                        {sessionData?.user?.id &&
                            <div className="space-x-1 my-3">
                                <button onClick={saveColors} className="btn btn-sm btn-primary btn-block">
                                    Save
                                </button>
                            </div>
                        }
                    </div>
                </label>
            </label>
            <Popover color={colors[currentKey]} setColor={setColor} isOpen={isOpen} togglePopover={() => setIsOpen(isOpen => !isOpen)} position={position} />
        </>
    )
}