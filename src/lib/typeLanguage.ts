// English ships as vocabulary-size slices (english1k/5k/10k/25k), but they are
// one competitive language: a test ranks and lands on the same English
// leaderboard regardless of vocabulary size. Collapsing the variants to the
// seeded "english" TestType is also what makes a signed-in user's score persist
// — TestType.findFirst returns null for an unseeded language, which silently
// drops the save. New englishNk sizes are covered automatically.
export function baseTypeLanguage(language: string | undefined): string | undefined {
    if (language && language.startsWith("english")) return "english";
    return language;
}
