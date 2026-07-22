import { expect, test, type Page } from "@playwright/test"
import { crowdedAccuracyTimeline, higherOrderTimeline, keyboardEvidenceTimeline, tionDrillTimeline } from "./helpers/evidence"
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc"
import { typeCurrentCharacter } from "./helpers/typing"

async function gotoPractice(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("typecafe:practice:custom-keys")) {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["e", "r"], durationSeconds: 60, textStyle: "varied" }))
    }
  })
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
      return await new Promise<Array<{ practice?: { kind?: string, target?: unknown, durationSeconds?: number, completed?: boolean, elapsedActivityMs?: number } }>>((resolve, reject) => {
        rows.onsuccess = () => resolve(rows.result)
        rows.onerror = () => reject(new Error(rows.error?.message ?? "IndexedDB read failed"))
      })
    } finally {
      database.close()
    }
  })
}

async function pendingRecentGrams(page: Page, language: string): Promise<string[]> {
  return page.evaluate((activeLanguage) => {
    const value = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams") ?? "null") as unknown
    if (!value || typeof value !== "object") return []
    const languages = (value as { languages?: unknown }).languages
    if (!languages || typeof languages !== "object") return []
    const snapshot = (languages as Record<string, unknown>)[activeLanguage]
    if (!snapshot || typeof snapshot !== "object") return []
    const entries = (snapshot as { entries?: unknown }).entries
    if (!Array.isArray(entries)) return []
    return entries.flatMap((entry) => entry && typeof entry === "object" && typeof (entry as { gram?: unknown }).gram === "string"
      ? [(entry as { gram: string }).gram]
      : [])
  }, language)
}

async function pendingCustomGramsSetupTimestamp(page: Page, language: string): Promise<number | null> {
  return page.evaluate((activeLanguage) => {
    const value = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams") ?? "null") as unknown
    if (!value || typeof value !== "object") return null
    const languages = (value as { languages?: unknown }).languages
    if (!languages || typeof languages !== "object") return null
    const snapshot = (languages as Record<string, unknown>)[activeLanguage]
    if (!snapshot || typeof snapshot !== "object") return null
    const setup = (snapshot as { setup?: unknown }).setup
    if (!setup || typeof setup !== "object") return null
    const updatedAt = (setup as { updatedAt?: unknown }).updatedAt
    return typeof updatedAt === "number" ? updatedAt : null
  }, language)
}

async function savedCustomKeysDuration(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const value = JSON.parse(window.localStorage.getItem("typecafe:practice:custom-keys") ?? "null") as unknown
    if (!value || typeof value !== "object") return null
    const durationSeconds = (value as { durationSeconds?: unknown }).durationSeconds
    return typeof durationSeconds === "number" ? durationSeconds : null
  })
}

async function setPracticeLanguage(page: Page, language: string) {
  await page.evaluate((nextLanguage) => {
    window.localStorage.setItem("typecafe:language", JSON.stringify(nextLanguage))
    window.dispatchEvent(new Event("typecafe:language-changed"))
  }, language)
}

test.describe("Practice entry", () => {
  test("defaults first use to Keys and saves a selected Custom path immediately", async ({ page }) => {
    await page.goto("/practice")
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()

    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "Grams" }).click()
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("typecafe:practice:last-custom-path"))).toBe("grams")
    await page.goto("/practice")
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
  })

  test("uses one global remembered path and keeps an empty language-specific Grams setup", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:last-custom-path", "grams"))
    await page.goto("/practice")
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByRole("button")).toHaveCount(0)

    await setPracticeLanguage(page, "french")
    await page.reload()
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByRole("button")).toHaveCount(0)
    await expect(page.evaluate(() => window.localStorage.getItem("typecafe:practice:last-custom-path"))).resolves.toBe("grams")
  })

  test("lets an explicit Custom path win and become remembered", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:last-custom-path", "keys"))
    await page.goto("/practice?custom=grams&target=key&keys=x&metric=accuracy")

    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "custom")
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    await expect(page.evaluate(() => window.localStorage.getItem("typecafe:practice:last-custom-path"))).resolves.toBe("grams")
  })

  test("gives a valid Guided Target precedence without changing Custom resume", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:last-custom-path", "grams"))
    await page.goto("/practice?target=key&keys=x&metric=accuracy&policy=acquisition")

    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "guided")
    await expect(page.getByTestId("practice-focus-summary")).toContainText("x")
    await expect(page.evaluate(() => window.localStorage.getItem("typecafe:practice:last-custom-path"))).resolves.toBe("grams")

    await page.goto("/practice")
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
  })

  test("explains an invalid Target once and falls back without false attribution", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:last-custom-path", "grams"))
    await page.goto("/practice?target=gram&gram=x")

    await expect(page.getByText("That Guided Target is no longer available. Resuming Custom Grams & words.")).toBeVisible()
    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "custom")
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Practise/ })).toHaveCount(0)
  })

  test("does not claim Custom Practice support or emit English fallback for Chinese and Hindi", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:language", JSON.stringify("chinese")))
    await page.goto("/practice")

    const unavailable = page.getByTestId("practice-language-unavailable")
    await expect(unavailable.getByRole("heading", { name: "Custom Practice isn’t available in Chinese" })).toBeVisible()
    await expect(unavailable).toContainText("won’t substitute English material")
    await expect(page.getByTestId("custom-practice-workspace")).toHaveCount(0)
    await expect(page.locator("#words")).toHaveCount(0)

    await setPracticeLanguage(page, "hindi")
    await expect(unavailable.getByRole("heading", { name: "Custom Practice isn’t available in Hindi" })).toBeVisible()
    await expect(page.locator("#words")).toHaveCount(0)

    await setPracticeLanguage(page, "english")
    await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
  })
})

test.describe("legacy Drill compatibility", () => {
  test("preserves a provable Target in Guided Practice", async ({ page }) => {
    await page.goto("/drill?keys=x&length=30&rm=opaque")

    await expect(page).toHaveURL(/\/practice\?target=key.*keys=x.*length=30.*rm=opaque/)
    expect(new URL(page.url()).searchParams.has("policy")).toBe(false)
    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "guided")
    await expect(page.getByTestId("practice-focus-summary")).toContainText("x")
  })

  test("sends legacy endurance and timed warm-ups to ordinary Home Tests", async ({ page }) => {
    await page.goto("/drill?target=endurance&shortSeconds=30&longSeconds=60")
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "timed" })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "60" })).toHaveAttribute("aria-pressed", "true")

    await page.goto("/drill?seconds=15")
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true")
  })

  test("lands truthfully when no Target can be proved", async ({ page }) => {
    await page.goto("/drill?target=gram&gram=x")
    await expect(page).toHaveURL(/\/practice$/)
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
  })
})

test.describe("Custom Practice", () => {
  test("renders scheduled language-shaped Pseudo carriers for Keys and Grams", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["q", "r"], durationSeconds: 30, textStyle: "pseudo" }))
      window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
        version: 2,
        languages: { english: { version: 2, language: "english", entries: [], setup: { grams: ["th", "tion"], durationSeconds: 30, textStyle: "pseudo", updatedAt: 10 } } },
      }))
    })
    await gotoPractice(page)

    const controls = page.getByRole("region", { name: "Practice controls" })
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)
    await expect.poll(async () => {
      const tokens = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 12)
      return tokens.length === 12 && tokens.every((token, index) => token.includes(index % 2 === 0 ? "q" : "r"))
    }).toBe(true)
    const keyTokens = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 12)
    expect(keyTokens).toHaveLength(12)
    keyTokens.forEach((token, index) => {
      expect(token).toMatch(/^\p{L}{3,}$/u)
      expect(token).toContain(index % 2 === 0 ? "q" : "r")
    })

    const previousPrompt = keyTokens.join(" ")
    await controls.getByRole("button", { name: "Grams" }).click()
    await expect.poll(async () => {
      const prompt = ((await page.locator("#words").textContent()) ?? "").trim()
      const tokens = prompt.split(/\s+/).slice(0, 12)
      return !prompt.includes(previousPrompt) && tokens.length === 12 && tokens.every((token, index) => token.includes(index % 2 === 0 ? "th" : "tion"))
    }).toBe(true)
    const gramTokens = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 12)
    gramTokens.forEach((token, index) => {
      const gram = index % 2 === 0 ? "th" : "tion"
      const start = token.indexOf(gram)
      const placement = Math.floor(index / 2) % 3
      expect(token).toMatch(/^\p{L}{3,10}$/u)
      if (placement === 0) expect(start).toBe(0)
      if (placement === 1) {
        expect(start).toBeGreaterThan(0)
        expect(start + gram.length).toBeLessThan(token.length)
      }
      if (placement === 2) expect(start + gram.length).toBe(token.length)
    })
  })

  test("renders numeric, terminal-mark, and hyphen Pseudo Keys as natural tokens", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["5", ";", "-"], durationSeconds: 30, textStyle: "pseudo" }))
    })
    await gotoPractice(page)

    await expect.poll(async () => {
      const tokens = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 12)
      return tokens.length === 12 && tokens.every((token, index) => token.includes(["5", ";", "-"][index % 3]!))
    }).toBe(true)
    const tokens = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 12)
    tokens.forEach((token, index) => {
      if (index % 3 === 0) expect(token).toMatch(/^\d{1,4}$/)
      if (index % 3 === 1) expect(token).toMatch(/^\p{L}{3,10};$/u)
      if (index % 3 === 2) expect(token).toMatch(/^\p{L}{3,10}-\p{L}{3,10}$/u)
    })
  })

  test("uses lowercase Home-style controls without a visible generic workspace title", async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem("practice-minimal-workspace-seeded")) {
        window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["e", "r", "t", "i", "o"], durationSeconds: 60, textStyle: "varied" }))
        window.sessionStorage.setItem("practice-minimal-workspace-seeded", "true")
      }
    })
    await gotoPractice(page)

    const controls = page.getByRole("region", { name: "Practice controls" })
    const run = page.getByRole("region", { name: "Practice run" })
    const editor = page.getByRole("region", { name: "Focus key editor" })
    const focusSummary = page.getByTestId("practice-focus-summary")
    await expect(page).toHaveTitle("Custom Practice | TypeCafe")
    await expect(page.locator("h1:not(.sr-only)")).toHaveCount(0)
    await expect(controls).not.toHaveClass(/rounded|border|bg-base-200/)
    await expect(run).not.toHaveClass(/rounded|border|bg-base-200/)
    await expect(controls.getByRole("button", { name: "60s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "keys", exact: true })).toHaveText("keys")
    await expect(controls.getByRole("button", { name: "Grams & words", exact: true })).toHaveText("Grams & words")
    await expect(controls.getByRole("button", { name: "varied", exact: true })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "pseudo", exact: true })).toHaveText("pseudo")
    await expect(focusSummary).toContainText("+2")
    await expect(focusSummary).toHaveCSS("white-space", "nowrap")
    await expect(focusSummary).toHaveCSS("overflow-x", "hidden")
    await expect(editor).toBeVisible()
    await expect(editor.getByRole("heading")).toHaveCount(0)
    await expect(editor).not.toContainText("Selected keys get extra reps")
    expect((await editor.boundingBox())!.y).toBeGreaterThan((await run.boundingBox())!.y)
    await focusSummary.click()
    await expect(editor).toBeFocused()

    await controls.getByRole("button", { name: "30s" }).click()
    await controls.getByRole("button", { name: "pseudo", exact: true }).click()
    await page.getByRole("button", { name: /^q key, available/ }).click()
    await expect(focusSummary).toContainText("+3")

    await page.reload()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(controls.getByRole("button", { name: "30s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "pseudo", exact: true })).toHaveClass(/text-primary/)
    await expect(page.getByRole("button", { name: /^q key, selected focus/ })).toBeVisible()
  })

  test("uses Home's finite duration bounds and keeps fullscreen setup intact", async ({ page }) => {
    await page.goto("/practice?custom=keys")
    const workspace = page.getByTestId("custom-practice-workspace")
    const controls = page.getByRole("region", { name: "Practice controls" })
    const durations = controls.getByRole("group", { name: "Duration" })

    await expect(durations.getByRole("button")).toHaveText(["15", "30", "60", "120", "custom"])
    await expect(controls.getByRole("button", { name: "Open typing settings" })).toHaveCount(0)

    await durations.getByRole("button", { name: "custom", exact: true }).click()
    const customDuration = durations.getByRole("spinbutton", { name: "Custom Practice duration" })
    await customDuration.fill("0")
    await customDuration.press("Enter")
    await expect.poll(() => savedCustomKeysDuration(page)).toBe(1)

    await durations.getByRole("button", { name: "custom", exact: true }).click()
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).fill("3601")
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).press("Enter")
    await expect.poll(() => savedCustomKeysDuration(page)).toBe(3_600)

    await page.reload()
    await expect(durations.getByRole("button", { name: "custom", exact: true })).toHaveClass(/text-primary/)
    await controls.getByRole("button", { name: "Enter fullscreen" }).click()
    await expect(workspace).toHaveAttribute("data-fullscreen", "true")
    expect(await workspace.evaluate((element) => ({
      position: getComputedStyle(element).position,
      zIndex: getComputedStyle(element).zIndex,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))).toEqual({ position: "fixed", zIndex: "500", width: await page.evaluate(() => window.innerWidth), height: await page.evaluate(() => window.innerHeight), viewportWidth: await page.evaluate(() => window.innerWidth), viewportHeight: await page.evaluate(() => window.innerHeight) })
    await controls.getByRole("button", { name: "Exit fullscreen" }).click()
    await expect(workspace).toHaveAttribute("data-fullscreen", "false")
    await expect(durations.getByRole("button", { name: "custom", exact: true })).toHaveClass(/text-primary/)
  })

  test("completes one-second custom and Guided Practice without losing attribution", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    let durations = page.getByRole("group", { name: "Duration" })
    await durations.getByRole("button", { name: "custom", exact: true }).click()
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).fill("1")
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).press("Enter")
    await page.clock.runFor(50)
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(async () => {
      await typeCurrentCharacter(page, 0)
      await expect(page.getByTestId("practice-workspace-configuration")).toHaveCSS("opacity", "0")
    }).toPass({ timeout: 5_000 })
    await page.clock.runFor(1_100)
    await expect(page.getByTestId("practice-recap")).toBeVisible()
    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBe(1)
    expect((await guestPracticeRecords(page))[0]?.practice).toMatchObject({ kind: "custom", durationSeconds: 1, completed: true })

    await page.goto("/practice?target=gram&gram=tion")
    durations = page.getByRole("group", { name: "Duration" })
    await durations.getByRole("button", { name: "custom", exact: true }).click()
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).fill("1")
    await durations.getByRole("spinbutton", { name: "Custom Practice duration" }).press("Enter")
    await page.clock.runFor(50)
    await expect(page.getByRole("heading", { name: "Practise tion" })).toBeVisible()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(async () => {
      await typeCurrentCharacter(page, 0)
      await expect(page.getByTestId("practice-workspace-configuration")).toHaveCSS("opacity", "0")
    }).toPass({ timeout: 5_000 })
    await page.clock.runFor(1_100)
    await expect(page.getByTestId("practice-recap")).toBeVisible()
    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBe(2)
    expect((await guestPracticeRecords(page)).find((record) => record.practice?.kind === "guided")?.practice)
      .toMatchObject({ kind: "guided", target: { kind: "gram", gram: "tion" }, durationSeconds: 1, completed: true })
  })

  test("restarts with fresh text and records only interrupted finite activity", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    const controls = page.getByRole("region", { name: "Practice controls" })
    const firstPrompt = await page.locator("#words").textContent()
    await controls.getByRole("button", { name: "Restart Practice" }).click()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    const restartedPrompt = await page.locator("#words").textContent()
    expect(restartedPrompt).not.toBe(firstPrompt)
    expect(await guestPracticeRecords(page)).toHaveLength(0)

    await typeCurrentCharacter(page, 0)
    await page.clock.runFor(250)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBe(1)
    const interrupted = (await guestPracticeRecords(page))[0]?.practice
    expect(interrupted).toMatchObject({ kind: "custom", completed: false })
    expect(interrupted?.elapsedActivityMs).toBeGreaterThan(0)
    expect(interrupted?.elapsedActivityMs).toBeLessThan(60_000)

    await controls.getByRole("button", { name: "Restart Practice" }).click()
    await page.clock.runFor(100)
    expect(await guestPracticeRecords(page)).toHaveLength(1)
  })

  test("shows only frozen natural-Test evidence without hiding focus", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [keyboardEvidenceTimeline(1), keyboardEvidenceTimeline(2, "custom-practice")] })
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["h"], durationSeconds: 60, textStyle: "varied" }))
    })
    await page.goto("/practice?custom=keys")

    const h = page.getByRole("button", { name: /^h key, selected focus/ })
    await expect(h).toHaveAttribute("aria-label", /50% accuracy/)
    await expect(h.locator("[data-kb-speed]")).toHaveAttribute("data-kb-speed")
    await expect(h).toHaveClass(/outline-primary/)
    await expect(h).not.toHaveClass(/ring-primary/)
    await expect(h.locator(".typecafe-key-focus")).toHaveCount(0)
    const evidenceStyle = await h.getAttribute("style")
    const speed = await h.locator("[data-kb-speed]").getAttribute("data-kb-speed")

    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    for (let index = 0; index < 8; index += 1) await typeCurrentCharacter(page, index)
    await expect(h).toHaveAttribute("style", evidenceStyle ?? "")
    await expect(h.locator("[data-kb-speed]")).toHaveAttribute("data-kb-speed", speed ?? "")
  })

  test("starts with a neutral selectable keyboard when no natural evidence or saved focus exists", async ({ page }) => {
    await page.goto("/practice?custom=keys")
    await expect(page.getByText("Choose a key on the keyboard to prepare a run.")).toBeVisible()
    const q = page.getByRole("button", { name: /^q key, available/ })
    await expect(q).toHaveAttribute("aria-label", /no accuracy data/)
    await expect(q).toHaveCSS("background-color", "rgba(120, 130, 180, 0.25)")
    await q.click()
    await expect(page.getByRole("button", { name: /^q key, selected focus/ })).toBeVisible()
  })

  test("restores saved focus before a higher-Impact supported key", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [crowdedAccuracyTimeline(1), crowdedAccuracyTimeline(2)] })
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem("practice-saved-focus-seeded")) {
        window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["x"], durationSeconds: 60, textStyle: "varied" }))
        window.sessionStorage.setItem("practice-saved-focus-seeded", "true")
      }
    })
    await page.goto("/practice?custom=keys")
    await expect(page.getByRole("button", { name: /^x key, selected focus/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /^r key, available/ })).toBeVisible()

  })

  test("initializes the highest-Impact supported key when no focus is saved", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [crowdedAccuracyTimeline(1), crowdedAccuracyTimeline(2)] })
    await page.goto("/practice?custom=keys")
    await expect(page.getByRole("button", { name: /^r key, selected focus/ })).toBeVisible()
  })

  test("keeps sticky layers exclusive and restores them after physical modifier peeks", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:layout", JSON.stringify("qwertz-de"))
    })
    await gotoPractice(page)
    const keyboard = page.getByRole("region", { name: "Practice keyboard" })
    const shift = page.getByRole("button", { name: "Show shifted keys (capitals and symbols)" })
    const altgr = page.getByRole("button", { name: "Show AltGr keys (accents and symbols)" })

    await shift.click()
    await expect(keyboard).toHaveAttribute("data-kb-layer", "shift")
    await altgr.click()
    await expect(shift).toHaveAttribute("aria-pressed", "false")
    await expect(keyboard).toHaveAttribute("data-kb-layer", "altgr")

    await page.dispatchEvent("body", "keydown", { key: "Shift" })
    await expect(keyboard).toHaveAttribute("data-kb-layer", "shift")
    await page.dispatchEvent("body", "keyup", { key: "Shift" })
    await expect(keyboard).toHaveAttribute("data-kb-layer", "altgr")

    await page.dispatchEvent("body", "keydown", { key: "Shift" })
    await page.dispatchEvent("body", "keydown", { key: "AltGraph" })
    await expect(keyboard).toHaveAttribute("data-kb-layer", "shiftAltgr")
    await page.dispatchEvent("body", "keyup", { key: "Shift" })
    await page.dispatchEvent("body", "keyup", { key: "AltGraph" })
    await expect(keyboard).toHaveAttribute("data-kb-layer", "altgr")
  })

  test("combines direct mixed Grams with explicitly corpus-ranked active-language material and restores independently", async ({ page }) => {
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("mixed-grams-seeded")) return
      window.sessionStorage.setItem("mixed-grams-seeded", "true")
      window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
        version: 2,
        languages: { english: { version: 2, language: "english", entries: [], setup: { grams: ["th", "the", "tion"], durationSeconds: 60, textStyle: "varied", updatedAt: 10 } } },
      }))
    })
    await gotoPractice(page)
    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "Grams" }).click()
    const gramEditor = page.getByRole("region", { name: "Grams and words editor" })
    await expect(page.getByTestId("selected-practice-grams")).toHaveCount(1)
    await expect(gramEditor.getByTestId("selected-practice-grams")).toBeVisible()
    await page.getByTestId("practice-focus-summary").click()
    await expect(page.getByTestId("custom-gram-input")).toBeFocused()

    await expect(page.getByTestId("selected-practice-grams")).toContainText("th")
    await expect(page.getByTestId("selected-practice-grams").getByRole("button")).toHaveText(["th×", "the×", "tion×"])
    await expect(gramEditor.getByRole("tab", { name: "Common in English" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText(/Frequency-ranked Custom material/)).toHaveCount(0)
    await expect(page.getByText(/Only Grams measured directly/)).toHaveCount(0)
    await expect(page.getByTestId("common-language-grams").getByRole("button").first()).toBeVisible()

    const input = page.getByTestId("custom-gram-input")
    await input.fill("er")
    await page.getByRole("region", { name: "Grams and words editor" }).getByRole("button", { name: "Add" }).click()
    await input.fill("ing")
    await input.press("Enter")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("er")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")
    await controls.getByRole("button", { name: "120s" }).click()
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await expect.poll(() => page.evaluate(() => {
      const payload = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams") ?? "null") as { languages?: { english?: { setup?: unknown } } } | null
      return payload?.languages?.english?.setup
    })).toMatchObject({ durationSeconds: 120, textStyle: "pseudo" })

    await page.goto("/practice")
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(controls.getByRole("button", { name: "Grams & words", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)
    await expect(page.getByTestId("selected-practice-grams")).toContainText("er")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")

    await expect(controls.getByRole("button", { name: /source|scope|combination|repetition|threshold/i })).toHaveCount(0)
  })

  test("keeps direct-entry Words whole through local save, Pseudo generation, and recap", async ({ page }) => {
    await page.clock.install()
    await page.goto("/practice?custom=grams")
    const editor = page.getByRole("region", { name: "Grams and words editor" })
    const input = editor.getByTestId("custom-gram-input")

    for (const item of ["th", "L’esprit", "co‑operate"]) {
      await input.fill(item)
      await editor.getByRole("button", { name: "Add" }).click()
    }
    const selected = page.getByTestId("selected-practice-grams")
    await expect(selected.getByRole("button", { name: "Remove th" })).toBeVisible()
    await expect(selected.getByRole("button", { name: "Remove l'esprit" })).toBeVisible()
    await expect(selected.getByRole("button", { name: "Remove co-operate" })).toBeVisible()

    await input.fill("two words")
    await editor.getByRole("button", { name: "Add" }).click()
    await expect(editor.getByRole("alert")).toContainText("complete 5–32 character Word with no spaces")

    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await controls.getByRole("button", { name: "30s" }).click()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    const prompt = (await page.locator("#words .char").allTextContents()).join("")
    expect(prompt).toContain("l'esprit")
    expect(prompt).toContain("co-operate")
    expect(prompt).not.toContain("l'esp ")

    await expect.poll(() => pendingRecentGrams(page, "english")).toEqual(expect.arrayContaining(["th", "l'esprit", "co-operate"]))
    await expect.poll(() => page.evaluate(() => {
      const payload = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams") ?? "null") as { languages?: { english?: { setup?: { grams?: string[] } } } } | null
      return payload?.languages?.english?.setup?.grams ?? []
    })).toEqual(["th", "l'esprit", "co-operate"])

    for (let index = 0; index < 140; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(30)
    }
    await page.clock.runFor(30_000)
    const recap = page.getByTestId("practice-recap")
    await expect(recap.getByTestId("practice-gram-l'esprit")).toContainText("attempt")
    await expect(recap.getByTestId("practice-gram-co-operate")).toContainText("attempt")
    await expect(recap.getByText("l'esprit", { exact: true })).toBeVisible()
    await expect(recap.getByText("co-operate", { exact: true })).toBeVisible()
  })

  test("shows measured slowdown in compact From your Tests Gram choices", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      timelineEvidence: [higherOrderTimeline(1), higherOrderTimeline(2)],
      customGramsPreference: {
        version: 2,
        language: "english",
        entries: [{ gram: "er", lastUsedAt: 20 }],
        setup: { grams: ["tion"], durationSeconds: 60, textStyle: "varied", updatedAt: 30 },
      },
    })
    await page.goto("/practice?custom=grams")

    const editor = page.getByRole("region", { name: "Grams and words editor" })
    await expect(editor.getByRole("tab", { name: "From your Tests" })).toHaveAttribute("aria-selected", "true")
    await expect(editor.getByText("extra pause in recent Tests")).toBeVisible()
    const measuredChoice = editor.getByTestId("measured-test-grams").getByRole("button", { name: /tion, \d+ ms extra pause/ })
    await expect(measuredChoice).toContainText(/^tion\+\d+ ms$/)
    await expect(measuredChoice).toHaveAttribute("aria-pressed", "true")

    await editor.getByRole("tab", { name: "Recent" }).click()
    await expect(editor.getByTestId("recent-custom-grams").getByRole("button", { name: "er", exact: true })).toBeVisible()
  })

  test("remembers only directly entered Grams as compact guest Recent choices", async ({ page }) => {
    await page.goto("/practice?custom=grams")
    await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
    await expect(page.getByTestId("recent-custom-grams")).toHaveCount(0)

    const editor = page.getByRole("region", { name: "Grams and words editor" })
    const input = page.getByTestId("custom-gram-input")
    await input.fill(" ER ")
    await editor.getByRole("button", { name: "Add" }).click()

    await editor.getByRole("tab", { name: "Recent" }).click()
    const recent = page.getByTestId("recent-custom-grams")
    await expect(recent.getByRole("button")).toHaveText(["er"])
    await expect(recent.getByRole("button", { name: "er", exact: true })).toHaveAttribute("aria-pressed", "true")

    await editor.getByRole("tab", { name: "Common in English" }).click()
    await page.getByTestId("common-language-grams").getByRole("button").first().click()
    await editor.getByRole("tab", { name: "Recent" }).click()
    await expect(recent.getByRole("button")).toHaveCount(1)

    await input.fill("ing")
    await input.press("Enter")
    await input.fill("er")
    await input.press("Enter")
    await editor.getByRole("tab", { name: "Recent" }).click()
    await expect(recent.getByRole("button")).toHaveText(["er", "ing"])

    await page.reload()
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er", "ing"])

    await page.evaluate(() => {
      const payload = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams")!) as { version: 1, languages: Record<string, unknown> }
      payload.languages.french = { version: 1, language: "french", entries: [{ gram: "éé", lastUsedAt: 30 }] }
      window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify(payload))
      window.localStorage.setItem("typecafe:language", JSON.stringify("french"))
      window.dispatchEvent(new Event("typecafe:language-changed"))
    })
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["éé"])
    await expect(page.getByRole("tab", { name: "Common in French" })).toBeVisible()
  })

  test("restores each guest language's complete Custom Grams setup", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 2,
      languages: {
        english: { version: 2, language: "english", entries: [], setup: { grams: ["th"], durationSeconds: 30, textStyle: "varied", updatedAt: 10 } },
        french: { version: 2, language: "french", entries: [], setup: { grams: ["éé"], durationSeconds: 47, textStyle: "pseudo", updatedAt: 20 } },
      },
    })))
    await page.goto("/practice?custom=grams")
    const controls = page.getByRole("region", { name: "Practice controls" })

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th")).toBeVisible()
    await expect(controls.getByRole("button", { name: "30s" })).toHaveClass(/text-primary/)
    await setPracticeLanguage(page, "french")
    await expect(page.getByRole("tab", { name: "Common in French" })).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove éé")).toBeVisible()
    await expect(controls.getByRole("button", { name: "custom", exact: true })).toHaveClass(/text-primary/)
    await controls.getByRole("button", { name: "custom", exact: true }).click()
    await expect(controls.getByRole("spinbutton", { name: "Custom Practice duration" })).toHaveValue("47")
    await controls.getByRole("spinbutton", { name: "Custom Practice duration" }).press("Escape")
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)

    await controls.getByRole("button", { name: "120s" }).click()
    await setPracticeLanguage(page, "english")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th")).toBeVisible()
    await setPracticeLanguage(page, "french")
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
  })

  test("merges the newest guest setup into signed-in per-language cross-device state", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 2,
      languages: {
        french: { version: 2, language: "french", entries: [], setup: { grams: ["été"], durationSeconds: 120, textStyle: "pseudo", updatedAt: 300 } },
      },
    })))
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { customGramsPreferences: {
      english: { version: 2, language: "english", entries: [], setup: { grams: ["th"], durationSeconds: 30, textStyle: "varied", updatedAt: 100 } },
      french: { version: 2, language: "french", entries: [], setup: { grams: ["éé"], durationSeconds: 240, textStyle: "varied", updatedAt: 200 } },
    } })
    await page.goto("/practice?custom=grams")
    const controls = page.getByRole("region", { name: "Practice controls" })

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th")).toBeVisible()
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été")).toBeVisible()
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
    await expect.poll(() => pendingCustomGramsSetupTimestamp(page, "french")).toBeNull()

    await setPracticeLanguage(page, "english")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th")).toBeVisible()
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été")).toBeVisible()

    await page.evaluate(() => window.localStorage.removeItem("typecafe:practice:recent-custom-grams"))
    await page.reload()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été")).toBeVisible()
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
  })

  test("blocks blended Gram edits while a signed-in language setup is loading", async ({ page }) => {
    const delays: Record<string, number> = {}
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      customGramsPreferences: {
        english: { version: 2, language: "english", entries: [], setup: { grams: ["th"], durationSeconds: 30, textStyle: "varied", updatedAt: 100 } },
        french: { version: 2, language: "french", entries: [], setup: { grams: ["éé"], durationSeconds: 240, textStyle: "pseudo", updatedAt: 200 } },
      },
      delayProcedures: delays,
    })
    await page.goto("/practice?custom=grams")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th")).toBeVisible()

    delays["customGramsPreference.get"] = 800
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("custom-grams-setup-loading")).toBeVisible()
    await expect(page.getByRole("region", { name: "Practice controls" })).toHaveCount(0)

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove éé")).toBeVisible()
    await expect(page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "custom", exact: true })).toHaveClass(/text-primary/)
  })

  test("merges pending guest Recent Grams into the signed-in per-language account", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 1,
      languages: { english: { version: 1, language: "english", entries: [{ gram: "er", lastUsedAt: 20 }] } },
    })))
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      customGramsPreference: { version: 1, language: "english", entries: [{ gram: "th", lastUsedAt: 10 }] },
    })
    await page.goto("/practice?custom=grams")

    const recent = page.getByTestId("recent-custom-grams")
    await expect(recent.getByRole("button")).toHaveText(["er", "th"])
    await expect.poll(() => pendingRecentGrams(page, "english")).toEqual([])

    await page.evaluate(() => window.localStorage.removeItem("typecafe:practice:recent-custom-grams"))
    await page.reload()
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er", "th"])
  })

  test("retains pending guest Recent Grams when the account merge fails", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 1,
      languages: { english: { version: 1, language: "english", entries: [{ gram: "er", lastUsedAt: 20 }] } },
    })))
    await mockAuthenticatedSession(page)
    await mockTrpc(page, {
      customGramsPreference: { version: 1, language: "english", entries: [{ gram: "th", lastUsedAt: 10 }] },
      errorProcedures: ["customGramsPreference.merge"],
    })
    await page.goto("/practice?custom=grams")

    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er", "th"])
    await expect.poll(() => pendingRecentGrams(page, "english")).toEqual(["er"])
  })

  test("timer completion shows focus-first per-key recap with no attempt floor", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()

    for (let index = 0; index < 35; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(50)
    }
    await expect(page.getByTestId("practice-workspace-configuration")).toHaveCSS("opacity", "0")
    await expect(page.getByRole("group", { name: "Text style" }).getByRole("button", { name: "pseudo", exact: true })).toBeDisabled()
    await page.clock.runFor(30_000)

    const recap = page.getByTestId("practice-recap")
    await expect(recap).toBeVisible()
    await expect(recap).toContainText("Your focus response")
    await expect(recap).toContainText("attempt")
    await expect(recap).toContainText("Accuracy")
    await expect(recap).toContainText("Building your practice baseline.")
    await expect(recap.locator('[data-testid^="practice-key-"]')).toHaveCount(2)
    await expect(recap.locator("article")).toHaveCount(0)
    await expect(recap).not.toContainText("Run complete")
    await expect(recap).not.toContainText("Overall")
    const repeat = recap.getByRole("button", { name: "Repeat with fresh text" })
    await expect(repeat).toBeVisible()
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
    await repeat.click()
    await expect(recap).toHaveCount(0)
    await expect(page.getByTestId("timed-countdown")).toContainText("30")
    await expect(page.getByTestId("practice-workspace-configuration")).toHaveCSS("opacity", "1")
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
  })

  test("leads a compared Custom item with its Practice Delta", async ({ page }) => {
    await page.clock.install()
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [keyboardEvidenceTimeline(1, "custom-practice")] })
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["h"], durationSeconds: 30, textStyle: "varied" }))
    })
    await page.goto("/practice?custom=keys")
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    for (let index = 0; index < 35; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(50)
    }
    await page.clock.runFor(30_000)

    const row = page.getByTestId("practice-key-h")
    const delta = row.getByText(/Practice delta:/)
    const response = row.getByText(/^\d+\.\d+% Accuracy/)
    await expect(delta).toBeVisible()
    await expect(response).toBeVisible()
    expect((await delta.boundingBox())!.y).toBeLessThan((await response.boundingBox())!.y)
  })

  test("streams the complete Practice prompt without changing character-index alignment", async ({ page }) => {
    await gotoPractice(page)
    const initial = await page.locator("#words .char").allTextContents()
    expect(initial).toHaveLength(500)

    await page.keyboard.type(initial.slice(0, 220).join(""))
    await expect(page.locator("#c500")).toBeAttached()
    const boundaryIds = await page.locator("#words .char").evaluateAll((elements) =>
      elements.slice(495, 506).map((element) => element.id))
    expect(boundaryIds).toEqual(Array.from({ length: 11 }, (_, offset) => `c${495 + offset}`))

    const extended = await page.locator("#words .char").allTextContents()
    await page.keyboard.type(extended.slice(220, 520).join(""))
    await expect(page.locator("#c520")).toHaveClass(/active-char/)
  })

  test("mixed-Gram timer completion shows every occurred item before the repeat action", async ({ page }, testInfo) => {
    await page.clock.install()
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 2,
      languages: { english: { version: 2, language: "english", entries: [], setup: { grams: ["th", "the", "tion"], durationSeconds: 60, textStyle: "varied", updatedAt: 10 } } },
    })))
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
    await expect(recap.locator('[data-testid^="practice-gram-"]')).toHaveCount(3)
    await expect(recap.locator("article")).toHaveCount(0)
    await expect(recap).not.toContainText("Run complete")
    await expect(recap).not.toContainText("Overall")
    const repeat = recap.getByRole("button", { name: "Repeat with fresh text" })
    await expect(repeat).toBeVisible()
    expect((await recap.getByTestId("practice-gram-th").boundingBox())!.y)
      .toBeLessThan((await repeat.boundingBox())!.y)
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    if (testInfo.project.name.startsWith("mobile")) {
      expect(await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        scrollX: window.scrollX,
      }))).toEqual({ fits: true, scrollX: 0 })
    }
  })

  test("keeps one compact workspace stack through active focus and restores it on cancellation", async ({ page }) => {
    await page.clock.install()
    await gotoPractice(page)
    const identity = page.getByTestId("practice-workspace-identity")
    const configuration = page.getByTestId("practice-workspace-configuration")
    const run = page.getByRole("region", { name: "Practice run" })
    const editor = page.getByRole("region", { name: "Focus key editor" })
    const configurationBox = (await configuration.boundingBox())!
    const runBox = (await run.boundingBox())!
    const editorBox = (await editor.boundingBox())!
    const promptY = (await page.locator("#words").boundingBox())!.y
    const controlsToRunGap = runBox.y - (configurationBox.y + configurationBox.height)
    const runToEditorGap = editorBox.y - (runBox.y + runBox.height)
    expect(controlsToRunGap).toBeGreaterThanOrEqual(16)
    expect(controlsToRunGap).toBeLessThanOrEqual(24)
    expect(runToEditorGap).toBeGreaterThanOrEqual(16)
    expect(runToEditorGap).toBeLessThanOrEqual(24)
    await typeCurrentCharacter(page, 0)
    await page.clock.runFor(1_500)
    await expect(identity).toHaveCSS("opacity", "0")
    await expect(configuration).toHaveCSS("opacity", "0")
    await expect(editor).toHaveCSS("opacity", "0")
    await expect(page.getByTestId("practice-status-bar")).toBeVisible()
    await expect(page.getByTestId("timed-countdown")).toBeVisible()
    expect(Math.abs((await page.locator("#words").boundingBox())!.y - promptY)).toBeLessThanOrEqual(1)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")

    await expect(page.getByTestId("practice-recap")).toHaveCount(0)
    await expect(page.getByTestId("timed-countdown")).toContainText("60")
    await expect(identity).toHaveCSS("opacity", "1")
    await expect(configuration).toHaveCSS("opacity", "1")
    await expect(editor).toHaveCSS("opacity", "1")
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
    await expect(page.getByRole("region", { name: "Grams and words editor" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})

test.describe("Guided Practice", () => {
  const evidence = encodeURIComponent(JSON.stringify({
    metric: "ms", baseline: 110, observed: 186, sampleCount: 12,
    reason: "Recent Tests measured tion with 76 ms of extra pause.",
  }))
  const href = `/practice?target=gram&gram=tion&policy=acquisition&evidence=${evidence}`

  test("opens one exact Target with Progress glyph grammar and converts once with a brief toast", async ({ page }) => {
    await page.goto(href)
    const workspace = page.getByTestId("custom-practice-workspace")
    await expect(workspace).toHaveAttribute("data-practice-kind", "guided")
    const title = page.getByRole("heading", { name: "Practise tion", exact: true })
    await expect(title).toBeVisible()
    await expect(title.locator("kbd")).toHaveText(["t", "i", "o", "n"])
    await expect(page.getByTestId("guided-practice-intent")).toHaveCount(0)
    await expect(page.getByTestId("selected-practice-grams")).toContainText("tion")

    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "120s" }).click()
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await expect(workspace).toHaveAttribute("data-practice-kind", "guided")

    await page.getByTestId("custom-gram-input").fill("ing")
    await page.getByRole("region", { name: "Grams and words editor" }).getByRole("button", { name: "Add" }).click()
    await expect(workspace).toHaveAttribute("data-practice-kind", "custom")
    await expect(page.locator("h1:not(.sr-only)")).toHaveCount(0)
    await expect(page.getByText("Changed to Custom Practice", { exact: true })).toBeVisible()
  })

  test("keeps an exact Transition on only its displayed pair", async ({ page }) => {
    await page.goto("/practice?target=transition&transitions=ju&metric=latency")

    const title = page.getByRole("heading", { name: "Practise j→u", exact: true })
    await expect(title).toBeVisible()
    await expect(title.locator("kbd")).toHaveText(["j", "u"])
    const selected = page.getByTestId("selected-practice-grams")
    await expect(selected.getByRole("button")).toHaveCount(1)
    await expect(selected.getByRole("button", { name: "Remove ju" })).toBeVisible()
    await expect(page.getByTestId("practice-focus-summary")).toHaveAttribute("aria-label", "Edit Gram or Word focus: ju")
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
  })

  test("keeps Guided Word Targets whole in Varied and Pseudo text", async ({ page }) => {
    await page.goto("/practice?target=word&words=action,station&sharedGram=tion")

    await expect(page.getByRole("heading", { name: "Practise action, station", exact: true })).toBeVisible()
    const selected = page.getByTestId("selected-practice-grams")
    await expect(selected.getByRole("button")).toHaveCount(2)
    await expect(selected.getByRole("button", { name: "Remove action" })).toBeVisible()
    await expect(selected.getByRole("button", { name: "Remove station" })).toBeVisible()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    let prompt = (await page.locator("#words .char").allTextContents()).join("").trim().split(/\s+/)
    expect(prompt.slice(0, -1).every((word) => word === "action" || word === "station")).toBe(true)
    expect(prompt).toEqual(expect.arrayContaining(["action", "station"]))

    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "Pseudo" }).click()
    await expect(page.locator("#c0")).toHaveClass(/active-char/)
    prompt = (await page.locator("#words .char").allTextContents()).join("").trim().split(/\s+/)
    expect(prompt.slice(0, -1).every((word) => word === "action" || word === "station")).toBe(true)
    expect(prompt).toEqual(expect.arrayContaining(["action", "station"]))
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
    await expect(recap).toContainText("Practice Delta: Building your Guided baseline.")
    await expect(recap).toContainText("Target attempt")
    const naturalReference = recap.getByTestId("guided-natural-reference")
    await expect(naturalReference).toHaveCount(1)
    await expect(naturalReference).toContainText("Recent natural-Test reference")
    await expect(naturalReference).toContainText("Recent Tests measured tion with 76 ms of extra pause.")
    await expect(recap.getByRole("heading", { name: "tion" })).toBeVisible()
    await expect(recap).not.toContainText("Guided Drill complete")
    await expect(recap).not.toContainText("Secondary")
    await expect(recap).not.toContainText("Overall")
    await expect(recap.getByTestId("guided-target-metric")).not.toHaveClass(/rounded|bg-base-200/)
    await expect(recap.getByRole("link", { name: "Take a Test" })).toHaveAttribute("href", "/")
    await expect(recap.getByRole("button", { name: "Practise again" })).toBeVisible()
    await expect(page.getByTestId("guided-awaiting-test")).toHaveText("practised · awaiting Test")

    await expect.poll(async () => (await guestPracticeRecords(page)).length).toBeGreaterThan(0)
    const records = await guestPracticeRecords(page)
    expect(records.at(-1)?.practice).toMatchObject({ kind: "guided", target: { kind: "gram", gram: "tion" }, completed: true })
  })

  test("leads a compared Guided Target with its Practice Delta", async ({ page }) => {
    await page.clock.install()
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [tionDrillTimeline(1)] })
    await page.goto(href)
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()
    for (let index = 0; index < 80; index += 1) {
      await typeCurrentCharacter(page, index)
      await page.clock.runFor(30)
    }
    await page.clock.runFor(30_000)

    const metric = page.getByTestId("guided-target-metric")
    const delta = metric.getByText(/Practice Delta:/)
    const response = metric.getByText(/^\d+ ms$/)
    await expect(delta).toBeVisible()
    await expect(response).toBeVisible()
    expect((await delta.boundingBox())!.y).toBeLessThan((await response.boundingBox())!.y)
  })

  test("mixed measured focus is Custom item feedback and attributes no Target", async ({ page }) => {
    await page.clock.install()
    await page.goto(href)
    const workspace = page.getByTestId("custom-practice-workspace")
    await expect(workspace).toHaveAttribute("data-practice-kind", "guided")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("tion")
    await page.getByTestId("custom-gram-input").fill("ing")
    await page.getByRole("region", { name: "Grams and words editor" }).getByRole("button", { name: "Add" }).click()
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")
    await expect(workspace).toHaveAttribute("data-practice-kind", "custom")
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
