// Native, language-aware proper-noun casing for generated word-list text.
// Word lists intentionally store lowercase tokens, so recover casing only for
// terms we can identify without guessing: countries/regions, timezone cities,
// language names, and locale-defined month/weekday names. Multi-word names are
// matched as phrases ("new york" -> "New York"), never by capitalizing a
// common component such as "new" or "united" on its own.

const LOCALES: Record<string, string> = {
    english: "en",
    french: "fr",
    spanish: "es",
    german: "de",
    italian: "it",
    portuguese: "pt",
    dutch: "nl",
    polish: "pl",
    chinese: "zh",
    hindi: "hi",
}

// Intl covers countries but not their first-level administrative divisions,
// and lowercased frequency lists lose the canonical form of initialisms. Keep
// this deliberately small and unambiguous: these are common English word-list
// tokens whose casing cannot be recovered from the surrounding random words.
const ENGLISH_CANONICAL_TERMS = [
    // Explicit country/demonym fallbacks keep these stable across ICU builds.
    "Australia", "Australian",
    // US states and the state-name components that also occur independently in
    // frequency lists. Full multi-word names still win when they occur together.
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
    "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Tennessee", "Texas",
    "Utah", "Vermont", "Virginia", "Washington", "Wisconsin", "Wyoming",
    "New York", "New Jersey", "New Mexico", "North Carolina", "South Carolina",
    "North Dakota", "South Dakota", "Rhode Island", "West Virginia",
    "Carolina", "Dakota", "District of Columbia",
    // Australian states and territories.
    "New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria",
    "Western Australia", "Australian Capital Territory", "Northern Territory",
    // Common, unambiguous initialisms present in the English frequency lists.
    "AI", "API", "BBC", "CEO", "CIA", "CPU", "CSS", "DNA", "DVD", "FAQ",
    "FBI", "GMT", "GPS", "HTML", "HTTP", "HTTPS", "IBM", "ISBN", "NASA",
    "NATO", "NBA", "NFL", "NHL", "PDF", "PHP", "RAM", "SQL", "TV", "UK",
    "UN", "URL", "USA", "USB", "XML",
]

interface ProperNoun {
    normalized: string[]
    canonical: string[]
}

const cache = new Map<string, ProperNoun[]>()

const localeFor = (language: string) => LOCALES[language.replace(/(?:1|5|10|25)k$/, "")] ?? "en"
const normalize = (value: string, locale: string) => value.normalize("NFC").toLocaleLowerCase(locale)

function addTerm(terms: Map<string, ProperNoun>, value: string, locale: string) {
    const canonical = value.trim().split(/\s+/).filter(Boolean)
    if (canonical.length === 0 || canonical.some((part) => !/^\p{L}+(?:[-'’]\p{L}+)*$/u.test(part))) return
    const normalized = canonical.map((part) => normalize(part, locale))
    // A locale may conventionally keep a name lowercase (French weekdays, for
    // example). Keeping its canonical form makes the policy language-correct.
    terms.set(normalized.join(" "), { normalized, canonical })
}

function termsFor(language: string): ProperNoun[] {
    const locale = localeFor(language)
    const cached = cache.get(locale)
    if (cached) return cached

    const terms = new Map<string, ProperNoun>()
    if (locale === "en") {
        for (const term of ENGLISH_CANONICAL_TERMS) addTerm(terms, term, locale)
    }
    const regions = new Intl.DisplayNames([locale], { type: "region" })
    // Intl has no supportedValuesOf("region"). Asking for every alpha-2 pair
    // and ignoring unchanged codes derives the runtime's complete CLDR region
    // set without shipping or maintaining a country dependency.
    for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a, b)
            const name = regions.of(code)
            if (name && name !== code) addTerm(terms, name, locale)
        }
    }
    for (const code of ["001", "002", "009", "019", "142", "150"]) {
        const name = regions.of(code)
        if (name && name !== code) addTerm(terms, name, locale)
    }

    const languages = new Intl.DisplayNames([locale], { type: "language" })
    for (const code of Object.values(LOCALES)) {
        const name = languages.of(code)
        if (name && name !== code) addTerm(terms, name, locale)
    }

    const supportedValuesOf = (Intl as typeof Intl & {
        supportedValuesOf?: (key: "timeZone") => string[]
    }).supportedValuesOf
    for (const zone of supportedValuesOf?.("timeZone") ?? []) {
        const city = zone.split("/").at(-1)?.replaceAll("_", " ")
        if (city) addTerm(terms, city, locale)
    }

    const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
    for (let month = 0; month < 12; month++) addTerm(terms, monthFormat.format(new Date(Date.UTC(2024, month, 1))), locale)
    const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" })
    for (let day = 1; day <= 7; day++) addTerm(terms, weekdayFormat.format(new Date(Date.UTC(2024, 0, day))), locale)

    if (locale === "en") addTerm(terms, "I", locale)

    const result = [...terms.values()].sort((left, right) => right.normalized.length - left.normalized.length)
    cache.set(locale, result)
    return result
}

// Return canonical tokens at the same indexes as the input. Longest phrases
// win, so "new york" is treated as a city before either token is considered.
export function capitalizeProperNouns(words: readonly string[], language: string): string[] {
    const locale = localeFor(language)
    const output = [...words]
    const normalizedWords = words.map((word) => normalize(word, locale))

    for (let index = 0; index < words.length; index++) {
        for (const term of termsFor(language)) {
            if (term.normalized.length > words.length - index) continue
            if (!term.normalized.every((part, offset) => normalizedWords[index + offset] === part)) continue
            term.canonical.forEach((part, offset) => { output[index + offset] = part })
            index += term.normalized.length - 1
            break
        }
    }

    return output
}
