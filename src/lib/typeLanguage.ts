// English ships as vocabulary-size slices (english1k/5k/10k/25k), but they are
// one competitive language: a test ranks and lands on the same English
// leaderboard regardless of vocabulary size. Collapsing the variants to the
// seeded "english" TestType is also what makes a signed-in user's score persist
// - TestType.findFirst returns null for an unseeded language, which silently
// drops the save. New englishNk sizes are covered automatically.
export function baseTypeLanguage(language: string | undefined): string | undefined {
    if (!language) return language;
    if (language.startsWith("english")) return "english";
    // Other languages now carry a size suffix too ("french5k", "german10k"); every
    // size shares one competitive TestType, so strip the suffix to the base language.
    return language.replace(/(1k|5k|10k|25k)$/, "");
}
