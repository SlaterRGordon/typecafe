import { useEffect } from "react";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { getDarkerShades, hexToHsl } from "~/utils/convertColor";
import { presets, withReadableContentColors } from "./colorPresets";
import type { Colors } from "./colorPresets";

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

export const setThemeColor = (name: string, hsl: string) => {
    document.documentElement.style.setProperty(name, hsl)
    document.documentElement.style.setProperty(`--color${name.slice(1)}`, `hsl(${hsl})`)

    const daisyColor = colorVariableMap[name]
    if (daisyColor) {
        document.documentElement.style.setProperty(daisyColor, `hsl(${hsl})`)
    }
}

// Paint already-normalized colors onto the document root.
export const applyColors = (normalizedColors: Colors) => {
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
}

// Apply the saved theme on load, independent of the (lazily mounted) ColorModal.
// Mounted once in Navigation so every page gets the theme without opening Colors.
export const useApplyColors = () => {
    const [colors] = useLocalStorage<Colors>("colors", presets.dracula)
    useEffect(() => {
        applyColors(withReadableContentColors(colors))
    }, [colors])
}
