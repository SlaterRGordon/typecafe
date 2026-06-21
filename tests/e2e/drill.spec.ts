import { expect, test } from "@playwright/test"
import { mockTrpc } from "./helpers/trpc"
import { typeVisibleTestText } from "./helpers/typing"

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

  test("transition drill biases text toward the requested pair", async ({ page }) => {
    await mockTrpc(page)
    await page.goto("/drill?transitions=br&length=4")

    await expect(page.getByRole("heading", { name: "b→r" })).toBeVisible()
    const words = (await page.locator("#words").innerText()).trim().split(/\s+/)
    expect(words).toHaveLength(4)
    expect(words.every((word) => word.includes("br"))).toBe(true)
  })
})
