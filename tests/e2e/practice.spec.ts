import { expect, test, type Page } from "@playwright/test"
import { typeCurrentCharacter } from "./helpers/typing"

async function gotoPractice(page: Page) {
  await page.goto("/practice")
  await expect(page.getByTestId("custom-keys-workspace")).toBeVisible()
  await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
}

async function guestPracticeRecords(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("typecafe", 1)
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error(request.error?.message ?? "IndexedDB open failed"))
    })
    try {
      const transaction = database.transaction("guestEvidenceTests", "readonly")
      const rows = transaction.objectStore("guestEvidenceTests").getAll()
      return await new Promise<Array<{ practice?: { completed?: boolean, elapsedActivityMs?: number } }>>((resolve, reject) => {
        rows.onsuccess = () => resolve(rows.result)
        rows.onerror = () => reject(new Error(rows.error?.message ?? "IndexedDB read failed"))
      })
    } finally {
      database.close()
    }
  })
}

test.describe("Custom Keys Practice", () => {
  test("keeps controls, finite typer, and layout-aware editor in one workspace and restores choices", async ({ page }) => {
    await gotoPractice(page)

    const controls = page.getByRole("region", { name: "Practice controls" })
    const run = page.getByRole("region", { name: "Practice run" })
    const editor = page.getByRole("region", { name: "Focus key editor" })
    await expect(controls.getByRole("button", { name: "60s" })).toHaveClass(/btn-primary/)
    await expect(controls.getByRole("button", { name: "Varied" })).toHaveClass(/btn-primary/)
    await expect(editor).toBeVisible()
    expect((await editor.boundingBox())!.y).toBeGreaterThan((await run.boundingBox())!.y)

    await controls.getByRole("button", { name: "30s" }).click()
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await page.getByRole("button", { name: /^q key, locked/ }).click()
    await expect(page.getByTestId("selected-practice-keys")).toContainText("q")

    await page.reload()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(controls.getByRole("button", { name: "30s" })).toHaveClass(/btn-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/btn-primary/)
    await expect(page.getByTestId("selected-practice-keys")).toContainText("q")
  })

  test("timer completion shows focus-first per-key recap with no attempt floor", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()

    for (let index = 0; index < 35; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(50)
    }
    await expect(page.getByRole("button", { name: "Stop run" })).toBeVisible()
    await expect(page.getByRole("group", { name: "Text style" }).getByRole("button", { name: "Pseudo" })).toBeDisabled()
    await page.clock.runFor(30_000)

    const recap = page.getByTestId("practice-recap")
    await expect(recap).toBeVisible()
    await expect(recap).toContainText("Your focus response")
    await expect(recap).toContainText("attempt")
    await expect(recap).toContainText("Accuracy")
    await expect(recap).toContainText("Building your practice baseline.")
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
  })

  test("stop persists elapsed activity without producing a comparison recap", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    await typeCurrentCharacter(page, 0)
    await page.clock.runFor(1_500)
    await page.getByRole("button", { name: "Stop run" }).click()

    await expect(page.getByTestId("practice-recap")).toHaveCount(0)
    await expect(page.getByTestId("timed-countdown")).toContainText("60")
    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBeGreaterThan(0)
    const records = await guestPracticeRecords(page)
    expect(records.at(-1)?.practice).toMatchObject({ completed: false })
    expect(records.at(-1)?.practice?.elapsedActivityMs).toBeGreaterThan(0)
  })

  test("fits the complete keyboard inside the mobile viewport", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "mobile viewport assertion")
    await gotoPractice(page)
    const keyboard = page.locator(".typecafe-keyboard .typecafe-key-heatmap")
    await expect(keyboard).toBeVisible()
    const box = await keyboard.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})
