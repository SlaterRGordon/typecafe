import { expect, test } from "@playwright/test"
import { mockTrpc } from "./helpers/trpc"
import { typeCurrentCharacter, typeVisibleTestText } from "./helpers/typing"

test.describe("drill page", () => {
  test("key drill renders real target-key words and completes", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?keys=x&length=4")

    await expect(page.getByRole("heading", { name: "x" })).toBeVisible()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    expect(words).toHaveLength(4)
    expect(words.every((word) => word.includes("x"))).toBe(true)

    await typeVisibleTestText(page)

    await expect(page.getByTestId("drill-result")).toBeVisible()
    await expect(page.getByRole("link", { name: "Re-measure" })).toHaveAttribute("href", "/?mode=timed&count=30")
    await page.getByRole("button", { name: "Drill again" }).click()
    await expect(page.getByTestId("drill-typer")).toBeVisible()
  })

  test("forwards a diagnosis re-measure token into the Re-measure CTA", async ({ page }) => {
    await mockTrpc(page)
    // A diagnosis hands off the just-completed test's config as an opaque rm token.
    const payload = JSON.stringify({
      beforeWpm: 40,
      config: { subMode: 1, count: 4, language: "english", customLength: true, punctuation: false, capitals: false, options: "" },
    })
    await page.goto(`/drill?keys=x&length=4&rm=${encodeURIComponent(payload)}`)
    await expect(page.getByTestId("drill-typer")).toBeVisible()

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

  test("transition drill biases text toward the requested pair", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?transitions=br&length=4")

    await expect(page.getByRole("heading", { name: "b→r" })).toBeVisible()
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    expect(words).toHaveLength(4)
    expect(words.every((word) => word.includes("br"))).toBe(true)
  })
})
