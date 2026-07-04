import { expect, test } from "@playwright/test"
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc"
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing"

async function pressRestartShortcut(page: Parameters<typeof mockTrpc>[0], key: "Enter" | "Space") {
  await page.keyboard.down("Tab")
  await page.keyboard.press(key)
  await page.keyboard.up("Tab")
}

test.describe("drill page", () => {
  // typing-feel §3: the result card renders eagerly from local numbers instead
  // of waiting on the signed-in save round-trip.
  test("signed-in drill shows the result before the slow save settles", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { delayProcedures: { "test.create": 4000 } })
    await page.goto("/drill?keys=x&length=4")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    await typeVisibleTestText(page)

    // Well before the 4s save delay could resolve.
    await expect(page.getByTestId("drill-result")).toBeVisible({ timeout: 2500 })
  })

  // Regression guard: the eager result unmounts the Typer before the idle-time
  // practiceStats sync settles; the drain must still run (hook-level callback)
  // or the next rep re-sends the previous rep's attempts and the server
  // double-counts them.
  test("signed-in reps each sync their own attempts exactly once", async ({ page }) => {
    const syncedTotals: number[] = []
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      onProcedure: (procedure, input) => {
        if (procedure === "practiceStats.batchSync" && Array.isArray(input?.stats)) {
          syncedTotals.push((input.stats as { total: number }[]).reduce((sum, s) => sum + s.total, 0))
        }
      },
    })
    await page.goto("/drill?keys=x&length=4")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    await typeVisibleTestText(page)
    await expect(page.getByTestId("drill-result")).toBeVisible()
    await expect.poll(() => syncedTotals.length).toBe(1)

    await pressRestartShortcut(page, "Enter")
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await typeVisibleTestText(page)
    await expect(page.getByTestId("drill-result")).toBeVisible()
    await expect.poll(() => syncedTotals.length).toBe(2)

    // Both reps type the same fixed drill text; an undrained map would fold
    // rep 1's attempts into rep 2's payload (double the total).
    expect(syncedTotals[1]).toBe(syncedTotals[0])
  })

  test("key drill renders real target-key words and completes", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?keys=x&length=4")

    await expect(page.getByRole("heading", { name: "x" })).toBeVisible()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    // No lifetime evidence → the header has no baseline stat and no next pick.
    await expect(page.getByTestId("drill-header-stat")).toHaveCount(0)
    await expect(page.getByTestId("drill-header-next")).toHaveCount(0)
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    expect(words).toHaveLength(4)
    expect(words.every((word) => word.includes("x"))).toBe(true)

    await typeVisibleTestText(page)

    await expect(page.getByTestId("drill-result")).toBeVisible()
    await expect(page.getByRole("link", { name: "Re-measure" })).toHaveAttribute("href", "/?mode=timed&count=30")
    // No lifetime evidence → no delta line and nothing left to suggest next.
    await expect(page.getByTestId("drill-delta")).toHaveCount(0)
    await expect(page.getByTestId("drill-next")).toHaveCount(0)
    await pressRestartShortcut(page, "Enter")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    await typeVisibleTestText(page)
    await expect(page.getByTestId("drill-result")).toBeVisible()
    await pressRestartShortcut(page, "Space")
    await expect(page.getByTestId("drill-typer")).toBeVisible()
  })

  test("forwards a diagnosis re-measure token into the Re-measure CTA", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:keyStats", JSON.stringify([
        { key: "q", attempts: 10, correct: 4 },
      ]))
    })
    await mockTrpc(page)
    // A diagnosis hands off the just-completed test's config as an opaque rm token.
    const payload = JSON.stringify({
      beforeWpm: 40,
      config: { subMode: 1, count: 4, language: "english", customLength: true, punctuation: false, capitals: false, options: "" },
    })
    await page.goto(`/drill?keys=x&length=4&rm=${encodeURIComponent(payload)}`)
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    // Hopping to the next drill keeps the token so Re-measure still works there.
    await expect(page.getByTestId("drill-header-next"))
      .toHaveAttribute("href", `/drill?keys=q&rm=${encodeURIComponent(payload)}`)

    await typeVisibleTestText(page)

    // Re-measure deep-links home carrying the token so the diagnosed test re-runs.
    await expect(page.getByRole("link", { name: "Re-measure" }))
      .toHaveAttribute("href", `/?rm=${encodeURIComponent(payload)}`)
  })

  test("runs a timed warm-up drill from a duration", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?seconds=15&return=plan")

    await expect(page.getByText("Timed warm-up")).toBeVisible()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    // Generic timed text (no fixed word list), ready to type.
    await expect(page.locator("#words .char").first()).toBeVisible()
  })

  test("a timed warm-up completes and offers Next step / Restart", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?seconds=3&return=plan")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    // A few keystrokes start the countdown; the timer then ends the test.
    for (let i = 0; i < 5; i++) await typeCurrentCharacter(page, i)

    await expect(page.getByTestId("drill-result")).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId("drill-continue-plan")).toHaveText("Next step →")
    await expect(page.getByRole("button", { name: "Restart" })).toBeVisible()
  })

  test("key drill result shows a lifetime delta and the next-worst drill", async ({ page }) => {
    // Guest lifetime evidence: x is the drilled target, q is the next-worst key.
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:keyStats", JSON.stringify([
        { key: "x", attempts: 20, correct: 10 },
        { key: "q", attempts: 10, correct: 4 },
      ]))
    })
    await mockTrpc(page)
    await page.goto("/drill?keys=x&length=4")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    // The header states the baseline to beat and offers the next pick up front
    // (from lifetime evidence, x excluded) — no completed rep required.
    await expect(page.getByTestId("drill-header-stat")).toHaveText("50.0% lifetime accuracy on this key. Beat it below.")
    await expect(page.getByTestId("drill-header-next")).toHaveAttribute("href", "/drill?keys=q")

    await typeVisibleTestText(page)

    // A clean rep on x beats the 50% lifetime baseline.
    const delta = page.getByTestId("drill-delta")
    await expect(delta).toContainText("x")
    await expect(delta).toContainText("above your lifetime average")
    // The next pick excludes the just-drilled x and lands on q; the result card
    // owns it now, so the header copy disappears.
    const next = page.getByTestId("drill-next")
    await expect(next).toHaveText("Next drill: q")
    await expect(next).toHaveAttribute("href", "/drill?keys=q")
    await expect(page.getByTestId("drill-header-next")).toHaveCount(0)

    // The header's session trail proves the rep landed (a clean rep on x is 100%).
    await expect(page.getByTestId("drill-session")).toHaveText("This session: 100.0% — 1 rep")

    // A restart (tab+enter) brings the header pick back — the user is never
    // forced through another full rep to reach the next drill.
    await pressRestartShortcut(page, "Enter")
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await expect(page.getByTestId("drill-header-next")).toHaveAttribute("href", "/drill?keys=q")

    // A second rep accumulates on the trail — the header visibly moves with
    // every rep even though the lifetime baseline barely does (ADR-0004).
    await typeVisibleTestText(page)
    await expect(page.getByTestId("drill-result")).toBeVisible()
    await expect(page.getByTestId("drill-session")).toContainText("2 reps")
  })

  test("transition drill result computes the delta and picks the next-worst pair", async ({ page }, testInfo) => {
    // br is the drilled pair (400ms mean); io (300ms) is the next-worst.
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:transitionStats", JSON.stringify([
        { pair: "br", count: 4, totalMs: 1600, errors: 1 },
        { pair: "io", count: 10, totalMs: 3000, errors: 1 },
        { pair: "th", count: 30, totalMs: 3000, errors: 0 },
        { pair: "he", count: 25, totalMs: 3000, errors: 0 },
      ]))
    })
    await mockTrpc(page)
    await page.goto("/drill?transitions=br&length=8")
    await expect(page.getByTestId("drill-typer")).toBeVisible()

    // Header states the pair's lifetime baseline and the next-worst pick.
    const headerStat = page.getByTestId("drill-header-stat")
    await expect(headerStat).toContainText("400ms on this jump")
    await expect(headerStat).toContainText("your typical transition")
    await expect(page.getByTestId("drill-header-next")).toHaveAttribute("href", "/drill?transitions=io")

    await typeVisibleTestText(page)

    // Synthetic keystrokes land far faster than the 400ms lifetime mean.
    const delta = page.getByTestId("drill-delta")
    await expect(delta).toContainText("b→r")
    await expect(delta).toContainText("faster than your lifetime average")
    // Next pick skips the just-drilled br and lands on the next-slowest pair, io.
    await expect(page.getByTestId("drill-next")).toHaveAttribute("href", "/drill?transitions=io")

    // The session trail carries the rep's ms on the drilled pair — the number
    // that moves per rep, since the lifetime baseline deliberately doesn't
    // (ADR-0004).
    const session = page.getByTestId("drill-session")
    await expect(session).toContainText("This session:")
    await expect(session).toContainText("ms — 1 rep")

    // The rep's target-saturated text must NOT rewrite the lifetime bigram
    // picture: the coach tab (desktop only — the inline mobile variant renders
    // on the home page) still recommends br from the untouched lifetime data.
    if (!testInfo.project.name.includes("mobile")) {
      const tab = page.getByTestId("home-coach-tab-drill")
      await tab.hover()
      const panel = page.getByTestId("home-coach-tab-drill-panel")
      await expect(panel).toContainText("b->r")
      await expect(panel.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?transitions=br")
    }
  })

  test("a completed drill surfaces fresh evidence in the coach tab without a reload", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "coach tabs are desktop-only outside the home page")
    // A guest with no history: no coach tab exists until this drill's synced
    // key stats create the first weak-key evidence.
    await mockTrpc(page)
    await page.goto("/drill?keys=x&length=4")
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    await expect(page.getByTestId("home-coach-tab-drill")).toBeHidden()

    // Miss every x, hit everything else — x becomes the only weak key.
    await expect(page.locator("#c0")).toHaveClass(/active-char/)
    const characters = await page.locator("#words .char").allTextContents()
    // The typer drops keystrokes for a brief window after load; land the first.
    await expect(async () => {
      if (characters[0] === "x") await typeWrongCharacter(page, 0)
      else await typeCurrentCharacter(page, 0)
      await expect(page.locator("#c0")).not.toHaveClass(/active-char/, { timeout: 500 })
    }).toPass({ timeout: 5_000 })
    for (let i = 1; i < characters.length; i++) {
      if (characters[i] === "x") await typeWrongCharacter(page, i)
      else await typeCurrentCharacter(page, i)
    }
    await expect(page.getByTestId("drill-result")).toBeVisible()

    // The always-mounted coach tab picked up the synced evidence live.
    const tab = page.getByTestId("home-coach-tab-drill")
    await expect(tab).toBeVisible()
    await tab.hover()
    const panel = page.getByTestId("home-coach-tab-drill-panel")
    await expect(panel).toContainText("Your weakest keys are x")
    await expect(panel.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?keys=x")
  })

  test("transition drill biases text toward the requested pair", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?transitions=br&length=4")

    await expect(page.getByRole("heading", { name: "b→r" })).toBeVisible()
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    expect(words).toHaveLength(4)
    expect(words.every((word) => word.includes("br"))).toBe(true)
  })

  test("rare letter transition drill avoids generated pseudo-words", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?transitions=yl&length=8")

    await expect(page.getByTestId("drill-typer")).toBeVisible()
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    const generatedFallbacks = new Set(["yl", "ylyl", "yyl", "yll"])

    expect(words).toHaveLength(8)
    expect(words.every((word) => !generatedFallbacks.has(word))).toBe(true)
  })
})
