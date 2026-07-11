import { describe, expect, it } from "vitest"
import blocklist from "../components/typer/languages/blocklist.json"
import english1k from "../components/typer/languages/english1k.json"
import english5k from "../components/typer/languages/english5k.json"
import english10k from "../components/typer/languages/english10k.json"
import english25k from "../components/typer/languages/english25k.json"
import french10k from "../components/typer/languages/french10k.json"
import spanish10k from "../components/typer/languages/spanish10k.json"
import german10k from "../components/typer/languages/german10k.json"
import italian10k from "../components/typer/languages/italian10k.json"
import portuguese10k from "../components/typer/languages/portuguese10k.json"
import dutch10k from "../components/typer/languages/dutch10k.json"
import polish10k from "../components/typer/languages/polish10k.json"
import chinese10k from "../components/typer/languages/chinese10k.json"
import hindi1k from "../components/typer/languages/hindi1k.json"

// Test text is a shareable surface (daily challenge, share cards, screenshots).
// The frequency lists came from a web corpus, so scrubbed profanity must not
// sneak back in via a list update. Exact match by design - see blocklist.json.
describe("word lists contain no blocklisted words", () => {
    const block = new Set(blocklist.words)
    const lists: [string, string[]][] = [
        ["english1k", english1k.words],
        ["english5k", english5k.words],
        ["english10k", english10k.words],
        ["english25k", english25k.words],
        ["french10k", french10k.words],
        ["spanish10k", spanish10k.words],
        ["german10k", german10k.words],
        ["italian10k", italian10k.words],
        ["portuguese10k", portuguese10k.words],
        ["dutch10k", dutch10k.words],
        ["polish10k", polish10k.words],
        ["chinese10k", chinese10k.words],
        ["hindi1k", hindi1k.words],
    ]

    it.each(lists)("%s", (_name, words) => {
        const hits = words.filter((w) => block.has(w.toLowerCase()))
        expect(hits).toEqual([])
    })
})
