import { useEffect, useState, useRef } from "react";
import { useWindowSize } from "usehooks-ts";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { Popover } from "./Popover";
import { getDarkerShades, hexToHsl } from "~/utils/convertColor";
import { ColorButton } from "./ColorButton";
import { presets, withReadableContentColors } from "./colorPresets";
import type { Colors } from "./colorPresets";
import { PresetButton } from "./PresetButton";
import { api } from "~/utils/api";
import { useSession } from "next-auth/react";
import { CustomColorButton } from "./CustomColorButton";
import { useDispatch } from "react-redux";
import { addAlert } from "~/state/alert/alertSlice";
import { ConfigOption } from "../typer/config/ConfigOption";

const colorVariableMap: Record<string, string | undefined> = {
    "--b1": "--color-base-100",
    "--b2": "--color-base-200",
    "--b3": "--color-base-300",
    "--bc": "--color-base-content",
    "--p": "--color-primary",
    "--pc": "--color-primary-content",
    "--s": "--color-secondary",
    "--sc": "--color-secondary-content",
    "--n": "--color-neutral",
    "--nf": "--color-neutral-content",
}

const setThemeColor = (name: string, hsl: string) => {
    document.documentElement.style.setProperty(name, hsl)
    document.documentElement.style.setProperty(`--color${name.slice(1)}`, `hsl(${hsl})`)

    const daisyColor = colorVariableMap[name]
    if (daisyColor) {
        document.documentElement.style.setProperty(daisyColor, `hsl(${hsl})`)
    }
}


export const ColorModal = () => {
    const dispatch = useDispatch()

    const { data: sessionData } = useSession()

    // Conditionally fetch saved colors if a user is logged in
    const { data: savedColors, refetch: refetchSavedColors } = api.color.getByUser.useQuery(
        undefined,
        {
            enabled: !!sessionData,
        }
    );

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

    const [tab, setTab] = useState<"Custom" | "Presets" | "Saved">("Presets")
    const [name, setName] = useState("")
    const [nameError, setNameError] = useState(false)
    const [colors, setColors] = useLocalStorage<Colors>("colors", presets.dracula)
    const [currentKey, setCurrentKey] = useState<keyof Colors>("--b1")

    const nameRef = useRef(null);

    const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setName(e.target.value)
        if (e.target.value.length > 0) {
            setNameError(false)
        }
    }

    const handleClickOutside = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = document.getElementById("input") as HTMLInputElement

        if (input) {
            if (!e.target.checked) input.focus()
            else {
                input.blur()
            }
        }
    }

    // convert hex to hsl and set color
    const setColor = (color: string) => {
        const nextColors = { ...colors, [currentKey]: color }

        if (currentKey === "--p") {
            setColors(withReadableContentColors({ ...nextColors, "--pc": "" }))
            return
        }

        if (currentKey === "--s") {
            setColors(withReadableContentColors({ ...nextColors, "--sc": "" }))
            return
        }

        setColors(withReadableContentColors(nextColors))
    }

    // set colors to a preset
    const setPreset = (preset: Colors, name: string) => {
        setName(name)
        setColors(withReadableContentColors(preset))
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
        setPosition({ left: e.currentTarget.getBoundingClientRect().left + 34, top: e.currentTarget.getBoundingClientRect().top - 175 })
        setIsOpen(isOpen => !isOpen)
    }

    // update document property on color change
    useEffect(() => {
        const normalizedColors = withReadableContentColors(colors)

        if (normalizedColors["--pc"] !== colors["--pc"] || normalizedColors["--sc"] !== colors["--sc"]) {
            setColors(normalizedColors)
            return
        }

        for (const key in normalizedColors) {
            if (normalizedColors[key as keyof Colors] != "") {
                const hsl = hexToHsl(normalizedColors[key as keyof Colors])
                setThemeColor(key, hsl)
                if (key == "--b1") {
                    const darkerShades = getDarkerShades(hexToHsl(normalizedColors[key as keyof Colors]))
                    setThemeColor("--b2", darkerShades[0] as string)
                    setThemeColor("--b3", darkerShades[1] as string)
                    setThemeColor("--n", darkerShades[3] as string)
                    setThemeColor("--nf", darkerShades[3] as string)
                } else if (key == "--p" || key == "--s") {
                    const darkerShades = getDarkerShades(hexToHsl(normalizedColors[key as keyof Colors]))
                    setThemeColor(`${key}f`, darkerShades[3] as string)
                }
            }
        }
    }, [colors, setColors])

    return (
        <>
            <input onChange={handleClickOutside} type="checkbox" id="colorModal" className="modal-toggle" />
            <label htmlFor="colorModal" className="modal modal-bottom !my-0 sm:modal-middle cursor-pointer">
                <label htmlFor="" className="flex flex-col modal-box sm:!w-[440px] !h-[80dvh] sm:!h-[540px] !max-w-5xl gap-2 overflow-hidden">
                    <div className="flex flex-col h-full min-h-0 gap-3">
                        <h3 className="font-bold text-4xl px-1 shrink-0">Colors</h3>
                        <div className="shrink-0">
                            <ConfigOption
                                variant="pill"
                                options={["Presets", "Saved", "Custom"]}
                                values={["Presets", "Saved", "Custom"]}
                                active={tab}
                                onChange={(newTab: string | number) => { setTab(newTab as "Presets" | "Custom" | "Saved") }}
                            />
                        </div>
                        {tab == "Saved" &&
                            <div className="flex min-h-0 flex-1 flex-col gap-2">
                                <h3 className="font-bold text-2xl shrink-0">Saved Colors</h3>
                                {sessionData?.user?.id ?
                                    <>
                                        <div className="grid min-h-0 flex-1 content-start grid-cols-2 gap-2 overflow-y-auto pr-1 mb-2">
                                            {savedColors?.map((colorConfiguration) => {
                                                const colors: Colors = {
                                                    "--b1": colorConfiguration.background,
                                                    "--bc": colorConfiguration.text,
                                                    "--p": colorConfiguration.primary,
                                                    "--s": colorConfiguration.secondary,
                                                    "--pc": "",
                                                    "--sc": "",
                                                }

                                                return <CustomColorButton key={colorConfiguration.id} id={colorConfiguration.id} name={colorConfiguration.name} preset={withReadableContentColors(colors)} setColors={setPreset} refetch={refetchSavedColors} />
                                            })}
                                            {savedColors?.length == 0 && <h2 className="col-span-2 text-xl">No saved colors yet</h2>}
                                        </div>
                                        <button onClick={() => setTab("Custom")} className="btn btn-block btn-primary shrink-0">
                                            Create New Color
                                        </button>
                                    </>
                                    :
                                    <h2 className="text-xl">Please log in to see saved colors</h2>
                                }
                            </div>
                        }
                        {tab == "Presets" &&
                            <div className="flex min-h-0 flex-1 flex-col gap-2">
                                <h3 className="font-bold text-2xl shrink-0">Color Presets</h3>
                                <div className="grid min-h-0 flex-1 content-start grid-cols-2 gap-2 overflow-y-auto pr-1">
                                    <PresetButton name="Dracula" preset={presets.dracula} hoverStyle="hover:!bg-dracula" setColors={setPreset} />
                                    <PresetButton name="Pastel" preset={presets.pastel} hoverStyle="hover:!bg-pastel" setColors={setPreset} />
                                    <PresetButton name="Aqua" preset={presets.aqua} hoverStyle="hover:!bg-aqua" setColors={setPreset} />
                                    <PresetButton name="Valentine" preset={presets.valentine} hoverStyle="hover:!bg-valentine" setColors={setPreset} />
                                    <PresetButton name="Cyberpunk" preset={presets.cyberpunk} hoverStyle="hover:!bg-cyberpunk" setColors={setPreset} />
                                    <PresetButton name="Retro" preset={presets.retro} hoverStyle="hover:!bg-retro" setColors={setPreset} />
                                </div>
                            </div>
                        }
                        {tab == "Custom" &&
                            <div className="flex min-h-0 flex-1 flex-col gap-4">
                                <h3 className="font-bold text-2xl shrink-0">Custom Color</h3>
                                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
                                    {sessionData?.user?.id &&
                                        <div className="flex flex-col gap-1.5">
                                            <h3 className="text-xl">Name</h3>
                                            <input
                                                id="nameInput"
                                                type="text" placeholder="Name"
                                                className={`input input-bordered w-full ${nameError ? "input-error" : ""}`}
                                                value={name}
                                                ref={nameRef}
                                                onClick={() => {
                                                    const input = nameRef.current as HTMLInputElement | null
                                                    if (input) input.focus()
                                                }}
                                                onKeyDown={() => {
                                                    const input = nameRef.current as HTMLInputElement | null
                                                    if (input) input.focus()
                                                }}
                                                onChange={onNameChange} />
                                        </div>
                                    }
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4">
                                        <ColorButton name="Background" color={colors["--b1"]} colorKey={"--b1"} togglePopover={togglePopover} />
                                        <ColorButton name="Text" color={colors["--bc"]} colorKey={"--bc"} togglePopover={togglePopover} />
                                        <ColorButton name="Primary" color={colors["--p"]} colorKey={"--p"} togglePopover={togglePopover} />
                                        <ColorButton name="Secondary" color={colors["--s"]} colorKey={"--s"} togglePopover={togglePopover} />
                                    </div>
                                </div>
                                {sessionData?.user?.id &&
                                    <button onClick={saveColors} className="btn btn-primary btn-block shrink-0">
                                        Save Color
                                    </button>
                                }
                            </div>
                        }
                    </div>
                </label>
            </label>
            <Popover color={colors[currentKey]} setColor={setColor} isOpen={isOpen} togglePopover={() => setIsOpen(isOpen => !isOpen)} position={position} />
        </>
    )
}
