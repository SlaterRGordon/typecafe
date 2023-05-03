import { useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { Popover } from "./Popover";
import { getDarkerShades, hexToHsl } from "~/utils/convertColor";
import { ColorButton } from "./ColorButton";
import { Colors, presets } from "./colorPresets";
import { PresetButton } from "./PresetButton";


export const ColorModal = () => {
    const [colors, setColors] = useLocalStorage<Colors>("colors", presets.dark)
    const [currentKey, setCurrentKey] = useState<keyof Colors>("--b1")

    // convert hex to hsl and set color
    const setColor = (color: string) => {
        setColors({ ...colors, [currentKey]: color })
    }

    // set colors to a preset
    const setPreset = (preset: Colors) => {
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
                } else if (key == "--p" || key == "--s" || key == "--n") {
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
                <label htmlFor="" className="modal-box !w-[600px] !max-w-5xl space-y-2 !overflow-y-visible">
                    <div className="mb-4">
                        <h3 className="font-bold text-2xl">Color Configuration</h3>
                        <div className="flex mx-1">
                            <ColorButton name="Background Color" color={colors["--b1"]} colorKey={"--b1"} togglePopover={togglePopover} />
                            <ColorButton name="Text Color" color={colors["--bc"]} colorKey={"--bc"} togglePopover={togglePopover} />
                        </div>
                        <div className="flex mx-1">
                            <ColorButton name="Primary Color" color={colors["--p"]} colorKey={"--p"} togglePopover={togglePopover} />
                            <ColorButton name="Secondary Color" color={colors["--s"]} colorKey={"--s"} togglePopover={togglePopover} />
                        </div>
                    </div>

                    <div className="mb-6">  
                        <h3 className="font-bold text-2xl">Color Presets</h3>
                        <div className="flex space-x-1">
                            <PresetButton name="Retro" preset={presets.retro} hoverStyle="hover:!bg-retro" setColors={setPreset} />
                            <PresetButton name="Valentine" preset={presets.valentine} hoverStyle="hover:!bg-valentine" setColors={setPreset} />
                            <PresetButton name="Cyberpunk" preset={presets.cyberpunk} hoverStyle="hover:!bg-cyberpunk" setColors={setPreset} />
                        </div>
                        <div className="flex space-x-1">
                            <PresetButton name="Aqua" preset={presets.aqua} hoverStyle="hover:!bg-aqua" setColors={setPreset} />
                            <PresetButton name="Dracula" preset={presets.dracula} hoverStyle="hover:!bg-dracula" setColors={setPreset} />
                            <PresetButton name="Pastel" preset={presets.pastel} hoverStyle="hover:!bg-pastel" setColors={setPreset} />
                        </div>
                    </div>
                </label>
            </label>
            <Popover color={colors[currentKey]} setColor={setColor} isOpen={isOpen} togglePopover={() => setIsOpen(isOpen => !isOpen)} position={position} />
        </>
    )
}