import { useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { Popover } from "./Popover";
import { getDarkerShades, hexToHsl, hslToHex } from "~/utils/convertColor";
import { ColorButton } from "./ColorButton";

interface Colors {
    "--b1": string,
    "--bc": string,
    "--p": string,
    "--s": string,
}

// get hex from css property
const getHexFromProperty = (property: string) => {
    return hslToHex(`hsl(${getComputedStyle(document.documentElement).getPropertyValue(property).trim().split(" ").join(",")})`)
}

export const ColorModal = () => {
    const [colors, setColors] = useLocalStorage<Colors>("colors", {
        "--b1": "#2a303c",
        "--bc": "#a6adba",
        "--p": "#6419e6",
        "--s": "#d926ac",
    })
    const [currentKey, setCurrentKey] = useState<keyof Colors>("--b1")

    // convert hex to hsl and set color
    const setColor = (color: string) => {
        setColors({ ...colors, [currentKey]: color })
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
                document.documentElement.style.setProperty(key, hexToHsl(colors[key as keyof Colors]))
                if (key == "--b1") {
                    const darkerShades = getDarkerShades(hexToHsl(colors[key as keyof Colors]))
                    document.documentElement.style.setProperty("--b2", darkerShades[0] as string)
                    document.documentElement.style.setProperty("--b3", darkerShades[1] as string)
                }
            }
        }
    }, [colors, setColors])

    return (
        <>
            <input type="checkbox" id="colorModal" className="modal-toggle" />
            <label htmlFor="colorModal" className="modal modal-bottom sm:modal-middle cursor-pointer">
                <label htmlFor="" className="modal-box space-y-2 !overflow-y-visible">
                    <h3 className="font-bold text-2xl">Color Configuration</h3>
                    <p className="text-sm">Select a color for the background of the website.</p>
                    <ColorButton name="Background Color" color={colors["--b1"]} colorKey={"--b1"} togglePopover={togglePopover} />
                    <ColorButton name="Text Color" color={colors["--bc"]} colorKey={"--bc"} togglePopover={togglePopover} />
                    <ColorButton name="Primary Color" color={colors["--p"]} colorKey={"--p"} togglePopover={togglePopover} />
                    <ColorButton name="Secondary Color" color={colors["--s"]} colorKey={"--s"} togglePopover={togglePopover} />
                </label>
            </label>
            <Popover color={colors[currentKey]} setColor={setColor} isOpen={isOpen} togglePopover={() => setIsOpen(isOpen => !isOpen)} position={position} />
        </>
    )
}