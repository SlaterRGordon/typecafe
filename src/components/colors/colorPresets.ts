export interface Colors {
    "--b1": string,
    "--bc": string,
    "--p": string,
    "--pc": string,
    "--s": string,
    "--sc": string,
}

const getReadableContentColor = (hex: string) => {
    const value = hex.replace("#", "")
    const red = parseInt(value.slice(0, 2), 16) / 255
    const green = parseInt(value.slice(2, 4), 16) / 255
    const blue = parseInt(value.slice(4, 6), 16) / 255
    const toLinear = (channel: number) => channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)

    return luminance > 0.179 ? "#000000" : "#ffffff"
}

export const withReadableContentColors = (colors: Omit<Colors, "--pc" | "--sc"> & Partial<Pick<Colors, "--pc" | "--sc">>): Colors => ({
    ...colors,
    "--pc": colors["--pc"] || getReadableContentColor(colors["--p"]),
    "--sc": colors["--sc"] || getReadableContentColor(colors["--s"]),
})

const darkPreset: Colors = {
    "--b1": "#e4d8b4",
    "--bc": "#282425",
    "--p": "#ef9995",
    "--pc": "#000000",
    "--s": "#a4cbb4",
    "--sc": "#000000",
}

const retroPreset: Colors = {
    "--b1": "#e4d8b4",
    "--bc": "#282425",
    "--p": "#ef9995",
    "--pc": "#000000",
    "--s": "#a4cbb4",
    "--sc": "#000000",
}

const valentinePreset: Colors = {
    "--b1": "#f0d6e8",
    "--bc": "#632c3b",
    "--p": "#e96d7b",
    "--pc": "#000000",
    "--s": "#a991f7",
    "--sc": "#000000",
}

const cyberpunkPreset: Colors = {
    "--b1": "#ffee00",
    "--bc": "#333000",
    "--p": "#ff7598",
    "--pc": "#000000",
    "--s": "#75d1f0",
    "--sc": "#000000",
}

const pastelPreset: Colors = {
    "--b1": "#ffffff",
    "--bc": "#333333",
    "--p": "#d1c1d7",
    "--pc": "#000000",
    "--s": "#f6cbd1",
    "--sc": "#000000",
}

const draculaPreset: Colors = {
    "--b1": "#282a36",
    "--bc": "#f8f8f2",
    "--p": "#ff79c6",
    "--pc": "#000000",
    "--s": "#bd93f9",
    "--sc": "#000000",
}

const aquaPreset: Colors = {
    "--b1": "#345da7",
    "--bc": "#c5daff",
    "--p": "#09ecf3",
    "--pc": "#000000",
    "--s": "#966fb3",
    "--sc": "#000000",
}

export interface Presets {
    "dark": Colors,
    "retro": Colors,
    "valentine": Colors,
    "cyberpunk": Colors,
    "pastel": Colors,
    "dracula": Colors,
    "aqua": Colors,
}

export const presets: Presets = {
    "dark": darkPreset,
    "retro": retroPreset,
    "valentine": valentinePreset,
    "cyberpunk": cyberpunkPreset,
    "pastel": pastelPreset,
    "dracula": draculaPreset,
    "aqua": aquaPreset,
}
