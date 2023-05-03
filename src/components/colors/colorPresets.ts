export interface Colors {
    "--b1": string,
    "--bc": string,
    "--p": string,
    "--s": string,
    "--n": string,
}

const darkPreset: Colors = {
    "--b1": "#e4d8b4",
    "--bc": "#282425",
    "--p": "#ef9995",
    "--s": "#a4cbb4",
    "--n": "#7d7259",
}

const retroPreset: Colors = {
    "--b1": "#e4d8b4",
    "--bc": "#282425",
    "--p": "#ef9995",
    "--s": "#a4cbb4",
    "--n": "#7d7259",
}

const valentinePreset: Colors = {
    "--b1": "#f0d6e8",
    "--bc": "#632c3b",
    "--p": "#e96d7b",
    "--s": "#a991f7",
    "--n": "#af4670",
}

const cyberpunkPreset: Colors = {
    "--b1": "#ffee00",
    "--bc": "#333000",
    "--p": "#ff7598",
    "--s": "#75d1f0",
    "--n": "#423f00",
}

const pastelPreset: Colors = {
    "--b1": "#f7f7f7",
    "--bc": "#f7f7f7",
    "--p": "#f7f7f7",
    "--s": "#f7f7f7",
    "--n": "#7d7259",
}

const draculaPreset: Colors = {
    "--b1": "#f7f7f7",
    "--bc": "#f7f7f7",
    "--p": "#f7f7f7",
    "--s": "#f7f7f7",
    "--n": "#7d7259",
}

export interface Presets {
    "dark": Colors,
    "retro": Colors,
    "valentine": Colors,
    "cyberpunk": Colors,
    "pastel": Colors,
    "dracula": Colors,
}

export const presets: Presets = {
    "dark": darkPreset,
    "retro": retroPreset,
    "valentine": valentinePreset,
    "cyberpunk": cyberpunkPreset,
    "pastel": pastelPreset,
    "dracula": draculaPreset,
}