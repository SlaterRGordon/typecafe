import { useEffect } from "react";
import useLocalStorage from "~/utils/hooks/useLocalStorage";
import { getDarkerShades, hexToHsl, readableTextColor } from "~/utils/convertColor";
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

// Blocking <head> script that paints the saved theme before first paint, so
// there's no flash of the default theme while React hydrates and useApplyColors
// (a post-mount effect) catches up. Reuses the exact runtime color helpers via
// .toString() so the boot path can't drift from applyColors above.
export const themeBootScript = `(function(){try{
var s=localStorage.getItem("colors");
var c=s?JSON.parse(s):${JSON.stringify(presets.dracula)};
var hexToHsl=${hexToHsl.toString()};
var getDarkerShades=${getDarkerShades.toString()};
var readableTextColor=${readableTextColor.toString()};
var map=${JSON.stringify(colorVariableMap)};
c["--pc"]=c["--pc"]||readableTextColor(c["--p"]);
c["--sc"]=c["--sc"]||readableTextColor(c["--s"]);
var r=document.documentElement;
function set(n,h){r.style.setProperty(n,h);r.style.setProperty("--color"+n.slice(1),"hsl("+h+")");if(map[n])r.style.setProperty(map[n],"hsl("+h+")");}
for(var k in c){if(c[k]==="")continue;var h=hexToHsl(c[k]);set(k,h);
if(k==="--b1"){var d=getDarkerShades(h);set("--b2",d[0]);set("--b3",d[1]);set("--n",d[3]);set("--nf",d[3]);}
else if(k==="--p"||k==="--s"){set(k+"f",getDarkerShades(h)[3]);}}
}catch(e){}})();`;

// Apply the saved theme on load, independent of the (lazily mounted) ColorModal.
// Mounted once in Navigation so every page gets the theme without opening Colors.
export const useApplyColors = () => {
    const [colors] = useLocalStorage<Colors>("colors", presets.dracula)
    useEffect(() => {
        applyColors(withReadableContentColors(colors))
    }, [colors])
}
