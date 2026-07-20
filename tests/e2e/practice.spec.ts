import { expect, test, type Page } from "@playwright/test"
import { brDrillTimeline, impactTimeline } from "./helpers/evidence"
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc"
import { typeCurrentCharacter } from "./helpers/typing"

async function gotoPractice(page: Page) {
  await page.goto("/practice?custom=keys")
  await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
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
      return await new Promise<Array<{ practice?: { kind?: string, target?: unknown, completed?: boolean, elapsedActivityMs?: number } }>>((resolve, reject) => {
        rows.onsuccess = () => resolve(rows.result)
        rows.onerror = () => reject(new Error(rows.error?.message ?? "IndexedDB read failed"))
      })
    } finally {
      database.close()
    }
  })
}

test.describe("Practice landing", () => {
  test("leads with Progress's highest-Impact Target and opens Guided directly", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [impactTimeline(1), impactTimeline(2)] })
    await page.goto("/practice")

    const recommendation = page.getByTestId("practice-recommendation")
    await expect(recommendation).toContainText("Recommended for you")
    await expect(recommendation.getByRole("heading")).toHaveText("b→r")
    await expect(recommendation).toContainText("Recent natural typing shows this transition taking 1.4× your typical transition time.")
    await expect(recommendation.getByRole("link", { name: "Start Guided" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/)
    await expect(page.getByRole("heading", { name: "Practice your way" })).toBeVisible()
    await expect(page.getByTestId("practice-path-keys")).toBeVisible()
    await expect(page.getByTestId("practice-path-grams")).toBeVisible()
  })

  test("keeps an awaiting Target and makes a normal Test primary", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [brDrillTimeline(3), impactTimeline(1), impactTimeline(2)] })
    await page.goto("/practice")

    const recommendation = page.getByTestId("practice-recommendation")
    await expect(recommendation).toContainText("b→r")
    await expect(recommendation).toContainText("practised · awaiting Test")
    await expect(recommendation.getByRole("link", { name: "Take a Test" })).toHaveAttribute("href", "/?mode=timed&count=30")
    await expect(recommendation.getByRole("link", { name: "Practise again" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/)
  })

  test("shows an honest empty state and independent lightweight continuations", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["q", "r"], durationSeconds: 30, textStyle: "pseudo" }))
      window.localStorage.setItem("typecafe:practice:custom-grams", JSON.stringify({ grams: ["th", "tion"], durationSeconds: 120, textStyle: "varied" }))
    })
    await page.goto("/practice")

    const empty = page.getByTestId("practice-empty")
    await expect(empty).toContainText("Find your focus")
    await expect(empty).toContainText("we won’t invent a Weakness")
    await expect(empty.getByRole("link", { name: "Take a Test" })).toHaveAttribute("href", "/?mode=timed&count=60")
    await expect(page.getByTestId("practice-recommendation")).toHaveCount(0)

    const keys = page.getByTestId("practice-path-keys")
    const grams = page.getByTestId("practice-path-grams")
    await expect(keys).toContainText("q · r")
    await expect(keys).toContainText("30s · Pseudo")
    await expect(keys.getByRole("link", { name: "Continue Keys" })).toHaveAttribute("href", "/practice?custom=keys")
    await expect(grams).toContainText("th · tion")
    await expect(grams).toContainText("120s · Varied")
    await expect(grams.getByRole("link", { name: "Continue Grams" })).toHaveAttribute("href", "/practice?custom=grams")
  })
})

test.describe("Custom Practice", () => {
  test("keeps controls, finite typer, and layout-aware Keys editor in one workspace and restores choices", async ({ page }) => {
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

  test("combines direct mixed Grams with explicitly corpus-ranked active-language material and restores independently", async ({ page }) => {
    await gotoPractice(page)
    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "Grams" }).click()

    await expect(page.getByTestId("selected-practice-grams")).toContainText("th")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("2-Gram").first()).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("3-Gram").first()).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("4-Gram").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Common in English" })).toBeVisible()
    await expect(page.getByText("Frequency-ranked Custom material—not a measured Weakness.")).toBeVisible()
    await expect(page.getByTestId("common-language-grams").getByRole("button").first()).toBeVisible()

    const input = page.getByTestId("custom-gram-input")
    await input.fill("er")
    await page.getByRole("region", { name: "Gram editor" }).getByRole("button", { name: "Add" }).click()
    await input.fill("ing")
    await input.press("Enter")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("er")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")
    await controls.getByRole("button", { name: "120s" }).click()
    await controls.getByRole("button", { name: "Pseudo" }).click()

    await page.reload()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(controls.getByRole("button", { name: "Keys" })).toHaveAttribute("aria-pressed", "true")
    await expect(controls.getByRole("button", { name: "60s" })).toHaveClass(/btn-primary/)
    await expect(controls.getByRole("button", { name: "Varied" })).toHaveClass(/btn-primary/)
    await controls.getByRole("button", { name: "Grams" }).click()
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/btn-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/btn-primary/)
    await expect(page.getByTestId("selected-practice-grams")).toContainText("er")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")

    await expect(controls.getByRole("button", { name: /source|scope|combination|repetition|threshold/i })).toHaveCount(0)
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

  test("mixed-Gram timer completion shows every occurred item before overall results", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "Grams" }).click()
    await controls.getByRole("button", { name: "30s" }).click()

    for (let index = 0; index < 80; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(30)
    }
    await page.clock.runFor(30_000)

    const recap = page.getByTestId("practice-recap")
    await expect(recap).toBeVisible()
    await expect(recap.getByTestId("practice-gram-th")).toContainText("Accuracy")
    await expect(recap.getByTestId("practice-gram-the")).toContainText("response WPM")
    await expect(recap.getByTestId("practice-gram-tion")).toContainText("attempt")
    await expect(recap).toContainText("Overall")
    expect((await recap.getByTestId("practice-gram-th").boundingBox())!.y)
      .toBeLessThan((await recap.getByText("Overall").boundingBox())!.y)
    await expect(page.getByRole("region", { name: "Gram editor" })).toBeVisible()
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

  test("fits the mixed Gram tray and editor inside the mobile viewport", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "mobile viewport assertion")
    await gotoPractice(page)
    await page.getByRole("group", { name: "Custom practice type" }).getByRole("button", { name: "Grams" }).click()
    await expect(page.getByRole("region", { name: "Gram editor" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})

test.describe("Guided Practice", () => {
  const evidence = encodeURIComponent(JSON.stringify({
    metric: "ms", baseline: 110, observed: 186, sampleCount: 12,
    reason: "Recent Tests measured tion with 76 ms of extra pause.",
  }))
  const href = `/practice?target=gram&gram=tion&policy=acquisition&evidence=${evidence}`

  test("opens one exact Target directly, preserves attribution for duration/style, and visibly converts on focus edits", async ({ page }) => {
    await page.goto(href)
    const workspace = page.getByTestId("custom-practice-workspace")
    await expect(workspace).toHaveAttribute("data-practice-kind", "guided")
    await expect(page.getByTestId("guided-practice-intent")).toContainText("Recent Tests measured tion")
    await expect(page.getByTestId("guided-practice-intent")).toContainText("186 ms")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("tion")

    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "120s" }).click()
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await expect(workspace).toHaveAttribute("data-practice-kind", "guided")

    await page.getByTestId("custom-gram-input").fill("ing")
    await page.getByRole("region", { name: "Gram editor" }).getByRole("button", { name: "Add" }).click()
    await expect(workspace).toHaveAttribute("data-practice-kind", "custom")
    await expect(page.getByText("Practice · Custom Grams")).toBeVisible()
  })

  test("records exactly one Target and leads completion with Target response, Test reference, and ordinary Test action", async ({ page }) => {
    await page.clock.install()
    await page.goto(href)
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()
    for (let index = 0; index < 80; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(30)
    }
    await page.clock.runFor(30_000)

    const recap = page.getByTestId("practice-recap")
    await expect(recap.getByTestId("guided-target-metric")).toContainText("Gram latency")
    await expect(recap).toContainText("Practice Delta")
    await expect(recap).toContainText("Target attempt")
    await expect(recap.getByTestId("guided-natural-reference")).toContainText("Recent natural-Test reference")
    await expect(recap).toContainText("Secondary")
    await expect(recap.getByRole("link", { name: "Take a Test" })).toHaveAttribute("href", "/")
    await expect(recap.getByRole("button", { name: "Practise again" })).toBeVisible()
    await expect(page.getByTestId("guided-awaiting-test")).toHaveText("practised · awaiting Test")

    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBeGreaterThan(0)
    const records = await guestPracticeRecords(page)
    expect(records.at(-1)?.practice).toMatchObject({ kind: "guided", target: { kind: "gram", gram: "tion" }, completed: true })
  })

  test("mixed measured focus is Custom item feedback and attributes no Target", async ({ page }) => {
    await page.clock.install()
    await page.goto(href)
    await page.getByTestId("custom-gram-input").fill("ing")
    await page.getByRole("region", { name: "Gram editor" }).getByRole("button", { name: "Add" }).click()
    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()
    for (let index = 0; index < 80; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(30)
    }
    await page.clock.runFor(30_000)

    await expect(page.getByTestId("practice-recap")).toContainText("Your focus response")
    const records = await guestPracticeRecords(page)
    expect(records.at(-1)?.practice).toMatchObject({ kind: "custom", completed: true })
    expect(records.at(-1)?.practice?.target).toBeUndefined()
  })
})
