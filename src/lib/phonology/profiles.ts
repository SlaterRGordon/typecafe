export const PHONOLOGY_LANGUAGES = [
    "english", "french", "spanish", "german", "italian", "portuguese", "dutch", "polish",
] as const

export type PhonologyLanguage = typeof PHONOLOGY_LANGUAGES[number]

export interface GraphemeRule {
    grapheme: string
    phonemes: readonly string[]
    nucleus: boolean
    atEnd?: boolean
    before?: ReadonlySet<string>
}

export interface PhonologyProfile {
    language: PhonologyLanguage
    vowels: ReadonlySet<string>
    rules: readonly GraphemeRule[]
    phones: Readonly<Record<string, readonly string[]>>
}

const rule = (
    grapheme: string,
    phonemes: string[],
    nucleus = false,
    context?: { atEnd?: boolean, before?: string },
): GraphemeRule => ({
    grapheme,
    phonemes,
    nucleus,
    atEnd: context?.atEnd,
    before: context?.before ? new Set([...context.before]) : undefined,
})

const commonPhones: Readonly<Record<string, readonly string[]>> = {
    b: ["b"], d: ["d"], f: ["f"], h: ["h"], k: ["k"], l: ["l"], m: ["m"],
    n: ["n"], p: ["p"], r: ["r"], s: ["s"], t: ["t"], v: ["v"], w: ["w"],
    z: ["z"],
}

const profile = (
    language: PhonologyLanguage,
    vowels: string,
    rules: GraphemeRule[],
    phones: Record<string, readonly string[]>,
): PhonologyProfile => ({
    language,
    vowels: new Set([...vowels]),
    rules: [...rules].sort((a, b) => b.grapheme.length - a.grapheme.length),
    phones: { ...commonPhones, ...phones },
})

const profiles: Record<PhonologyLanguage, PhonologyProfile> = {
    english: profile("english", "aeiouy", [
        rule("e", [], false, { atEnd: true }),
        rule("c", ["s"], false, { before: "eiy" }),
        rule("g", ["dʒ"], false, { before: "eiy" }),
        rule("tch", ["tʃ"]), rule("dge", ["dʒ"]), rule("igh", ["aɪ"], true),
        rule("air", ["ɛə"], true), rule("ear", ["ɪə"], true),
        rule("ch", ["tʃ"]), rule("sh", ["ʃ"]), rule("th", ["θ"]),
        rule("ph", ["f"]), rule("ng", ["ŋ"]), rule("qu", ["k", "w"]),
        rule("wh", ["w"]), rule("ck", ["k"]), rule("ee", ["i"], true),
        rule("ea", ["i"], true), rule("oo", ["u"], true), rule("ou", ["aʊ"], true),
        rule("ow", ["aʊ"], true), rule("ai", ["eɪ"], true), rule("ay", ["eɪ"], true),
        rule("oa", ["oʊ"], true), rule("oi", ["ɔɪ"], true), rule("oy", ["ɔɪ"], true),
        rule("au", ["ɔ"], true), rule("aw", ["ɔ"], true), rule("er", ["ɚ"], true),
        rule("ir", ["ɚ"], true), rule("ur", ["ɚ"], true),
    ], {
        a: ["æ"], c: ["k"], e: ["ɛ"], g: ["g"], i: ["ɪ"], j: ["dʒ"],
        o: ["ɒ"], q: ["k"], u: ["ʌ"], x: ["k", "s"], y: ["ɪ"],
    }),

    french: profile("french", "aàâæeéèêëiîïoôœuùûüy", [
        rule("e", [], false, { atEnd: true }),
        rule("c", ["s"], false, { before: "eéiîïy" }),
        rule("g", ["ʒ"], false, { before: "eéiîïy" }),
        rule("eau", ["o"], true), rule("œu", ["ø"], true),
        rule("ain", ["ɛ̃"], true), rule("ein", ["ɛ̃"], true),
        rule("ill", ["j"]), rule("gn", ["ɲ"]), rule("ch", ["ʃ"]),
        rule("ph", ["f"]), rule("th", ["t"]), rule("qu", ["k"]), rule("gu", ["g"]),
        rule("an", ["ɑ̃"], true), rule("en", ["ɑ̃"], true), rule("on", ["ɔ̃"], true),
        rule("in", ["ɛ̃"], true), rule("un", ["œ̃"], true), rule("ou", ["u"], true),
        rule("oi", ["w", "a"], true), rule("eu", ["ø"], true), rule("au", ["o"], true),
        rule("ai", ["ɛ"], true), rule("ei", ["ɛ"], true),
    ], {
        a: ["a"], à: ["a"], â: ["ɑ"], æ: ["e"], c: ["k"], ç: ["s"],
        e: ["ə"], é: ["e"], è: ["ɛ"], ê: ["ɛ"], ë: ["ə"], g: ["g"],
        i: ["i"], î: ["i"], ï: ["i"], j: ["ʒ"], o: ["ɔ"], ô: ["o"], œ: ["œ"],
        q: ["k"], u: ["y"], ù: ["y"], û: ["y"], ü: ["y"], x: ["k", "s"], y: ["i"],
    }),

    spanish: profile("spanish", "aáeéiíoóuúüy", [
        rule("h", []), rule("c", ["s"], false, { before: "eéií" }),
        rule("g", ["x"], false, { before: "eéií" }),
        rule("ch", ["tʃ"]), rule("ll", ["ʝ"]), rule("rr", ["r"]),
        rule("qu", ["k"]), rule("gu", ["g"]),
        rule("ai", ["a", "j"], true), rule("ay", ["a", "j"], true),
        rule("ei", ["e", "j"], true), rule("ey", ["e", "j"], true),
        rule("oi", ["o", "j"], true), rule("oy", ["o", "j"], true),
        rule("au", ["a", "w"], true), rule("eu", ["e", "w"], true),
    ], {
        a: ["a"], á: ["a"], c: ["k"], e: ["e"], é: ["e"], g: ["g"],
        i: ["i"], í: ["i"], j: ["x"], ñ: ["ɲ"], o: ["o"], ó: ["o"],
        q: ["k"], u: ["u"], ú: ["u"], ü: ["u"], x: ["k", "s"], y: ["i"],
    }),

    german: profile("german", "aäeëiïoöuüy", [
        rule("sch", ["ʃ"]), rule("tsch", ["tʃ"]), rule("ch", ["x"]),
        rule("ph", ["f"]), rule("th", ["t"]), rule("qu", ["k", "v"]),
        rule("ng", ["ŋ"]), rule("sp", ["ʃ", "p"]), rule("st", ["ʃ", "t"]),
        rule("ei", ["aɪ"], true), rule("ie", ["i"], true), rule("eu", ["ɔɪ"], true),
        rule("äu", ["ɔɪ"], true), rule("au", ["aʊ"], true),
    ], {
        a: ["a"], ä: ["ɛ"], c: ["k"], e: ["e"], ë: ["e"], g: ["g"],
        i: ["ɪ"], ï: ["i"], j: ["j"], o: ["ɔ"], ö: ["ø"], q: ["k"],
        u: ["ʊ"], ü: ["y"], x: ["k", "s"], y: ["y"], v: ["f"], w: ["v"],
        z: ["t", "s"], ß: ["s"],
    }),

    italian: profile("italian", "aàeèéiìíoòóuùú", [
        rule("c", ["tʃ"], false, { before: "eèéiìí" }),
        rule("g", ["dʒ"], false, { before: "eèéiìí" }),
        rule("sci", ["ʃ", "i"], true), rule("gn", ["ɲ"]), rule("gl", ["ʎ"]),
        rule("ch", ["k"]), rule("gh", ["g"]), rule("ci", ["tʃ", "i"], true),
        rule("gi", ["dʒ", "i"], true), rule("qu", ["k", "w"]),
        rule("ai", ["a", "i"], true), rule("ei", ["e", "i"], true),
        rule("oi", ["o", "i"], true), rule("au", ["a", "u"], true),
    ], {
        a: ["a"], à: ["a"], c: ["k"], e: ["e"], è: ["ɛ"], é: ["e"],
        g: ["g"], i: ["i"], ì: ["i"], í: ["i"], j: ["j"], o: ["o"],
        ò: ["ɔ"], ó: ["o"], q: ["k"], u: ["u"], ù: ["u"], ú: ["u"],
        x: ["k", "s"], y: ["i"], z: ["t", "s"],
    }),

    portuguese: profile("portuguese", "aáâãeéêiíoóôõuúüy", [
        rule("h", []), rule("c", ["s"], false, { before: "eéêií" }),
        rule("g", ["ʒ"], false, { before: "eéêií" }),
        rule("ões", ["õ", "j", "ʃ"], true), rule("ão", ["ɐ̃", "w"], true),
        rule("õe", ["õ", "j"], true), rule("nh", ["ɲ"]), rule("lh", ["ʎ"]),
        rule("ch", ["ʃ"]), rule("rr", ["ʁ"]), rule("ss", ["s"]),
        rule("qu", ["k"]), rule("gu", ["g"]), rule("ai", ["a", "j"], true),
        rule("ei", ["e", "j"], true), rule("oi", ["o", "j"], true),
        rule("ou", ["o"], true), rule("au", ["a", "w"], true),
    ], {
        a: ["a"], á: ["a"], â: ["ɐ"], ã: ["ɐ̃"], c: ["k"], ç: ["s"],
        e: ["e"], é: ["ɛ"], ê: ["e"], g: ["g"], i: ["i"], í: ["i"],
        j: ["ʒ"], o: ["o"], ó: ["ɔ"], ô: ["o"], õ: ["õ"], q: ["k"],
        u: ["u"], ú: ["u"], ü: ["u"], x: ["ʃ"], y: ["i"],
    }),

    dutch: profile("dutch", "aeëiouy", [
        rule("sch", ["s", "x"]), rule("ch", ["x"]), rule("ng", ["ŋ"]),
        rule("nk", ["ŋ", "k"]), rule("sj", ["ʃ"]), rule("tj", ["c"]),
        rule("qu", ["k", "w"]), rule("ij", ["ɛi"], true), rule("ei", ["ɛi"], true),
        rule("ui", ["œy"], true), rule("ou", ["ʌu"], true), rule("au", ["ʌu"], true),
        rule("oe", ["u"], true), rule("ie", ["i"], true), rule("eu", ["ø"], true),
        rule("aa", ["a"], true), rule("ee", ["e"], true), rule("oo", ["o"], true),
        rule("uu", ["y"], true),
    ], {
        a: ["ɑ"], c: ["k"], e: ["ɛ"], ë: ["ə"], g: ["ɣ"], i: ["ɪ"],
        j: ["j"], o: ["ɔ"], q: ["k"], u: ["ʏ"], x: ["k", "s"], y: ["i"],
    }),

    polish: profile("polish", "aąeęioóuy", [
        rule("dzi", ["dʑ"]), rule("dź", ["dʑ"]), rule("dż", ["dʐ"]),
        rule("cz", ["tʂ"]), rule("sz", ["ʂ"]), rule("rz", ["ʐ"]),
        rule("ch", ["x"]), rule("dz", ["d", "z"]), rule("ci", ["tɕ", "i"], true),
        rule("si", ["ɕ", "i"], true), rule("zi", ["ʑ", "i"], true),
        rule("ni", ["ɲ", "i"], true),
    ], {
        a: ["a"], ą: ["ɔ̃"], c: ["t", "s"], e: ["ɛ"], ę: ["ɛ̃"], g: ["g"],
        i: ["i"], j: ["j"], ł: ["w"], ń: ["ɲ"], o: ["ɔ"], ó: ["u"],
        q: ["k"], ś: ["ɕ"], u: ["u"], w: ["v"], x: ["k", "s"], y: ["ɨ"],
        ź: ["ʑ"], ż: ["ʐ"],
    }),
}

export const profileFor = (language: string): PhonologyProfile | null =>
    profiles[language as PhonologyLanguage] ?? null
