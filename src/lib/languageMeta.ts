// Display metadata for the languages offered in the picker (the nav globe menu),
// shared by the nav and the typer bar so both name languages identically. Order is
// the menu order. chinese/hindi are seeded competitive but intentionally not offered
// here (non-Latin, out of scope - see docs/features/global-language.md).
export interface LanguageMeta { value: string, label: string, short: string }

export const PICKER_LANGUAGES: LanguageMeta[] = [
    { value: "english", label: "English", short: "en" },
    { value: "french", label: "French", short: "fr" },
    { value: "spanish", label: "Spanish", short: "es" },
    { value: "german", label: "German", short: "de" },
    { value: "italian", label: "Italian", short: "it" },
    { value: "portuguese", label: "Portuguese", short: "pt" },
    { value: "dutch", label: "Dutch", short: "nl" },
    { value: "polish", label: "Polish", short: "pl" },
]

export const languageMeta = (base: string): LanguageMeta =>
    PICKER_LANGUAGES.find((language) => language.value === base) ?? PICKER_LANGUAGES[0]!

export const supportsCustomPractice = (base: string): boolean =>
    PICKER_LANGUAGES.some((language) => language.value === base)
