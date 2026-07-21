import { expect, test, type Page } from "@playwright/test"
import { brDrillTimeline, crowdedAccuracyTimeline, impactTimeline, keyboardEvidenceTimeline, tionDrillTimeline } from "./helpers/evidence"
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
      return await new Promise<Array<{ practice?: { kind?: string, target?: unknown, completed?: boolean, elapsedActivityMs?: number } }>>((resolve, reject) => {
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

async function setPracticeLanguage(page: Page, language: string) {
  await page.evaluate((nextLanguage) => {
    window.localStorage.setItem("typecafe:language", JSON.stringify(nextLanguage))
    window.dispatchEvent(new Event("typecafe:language-changed"))
  }, language)
}

test.describe("Practice landing", () => {
  test("leads with Progress's highest-Impact Target and opens Guided directly", async ({ page }) => {
    await mockAuthenticatedSession(page)
    await mockTrpc(page, { timelineEvidence: [impactTimeline(1), impactTimeline(2)] })
    await page.goto("/practice")

    const recommendation = page.getByTestId("practice-recommendation")
    await expect(recommendation).toContainText("Recommended for you")
    const target = recommendation.getByRole("heading", { name: "b→r" })
    await expect(target.locator("kbd")).toHaveText(["b", "r"])
    await expect(target).toContainText("→")
    await expect(recommendation).toContainText("Recent natural typing shows this transition taking 1.4× your typical transition time.")
    await expect(recommendation.getByRole("link", { name: "Practice this transition" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/)
    await expect(recommendation).not.toHaveClass(/rounded|border|bg-primary/)
    await expect(page.getByTestId("practice-path-keys")).toBeVisible()
    await expect(page.getByTestId("practice-path-grams")).toBeVisible()
    await expect(page.getByTestId("practice-landing").locator("article")).toHaveCount(0)
    await expect(page.getByTestId("practice-landing").locator(".material-symbols-rounded")).toHaveCount(0)
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
      window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
        version: 2,
        languages: {
          english: { version: 2, language: "english", entries: [], setup: { grams: ["th", "tion"], durationSeconds: 120, textStyle: "varied", updatedAt: 10 } },
          french: { version: 2, language: "french", entries: [], setup: { grams: ["ét", "tion"], durationSeconds: 240, textStyle: "pseudo", updatedAt: 20 } },
        },
      }))
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

    await setPracticeLanguage(page, "french")
    await expect(grams).toContainText("ét · tion")
    await expect(grams).toContainText("240s · Pseudo")
    await expect(keys).toContainText("q · r")
    await expect(page.getByTestId("practice-landing").locator("article")).toHaveCount(0)
  })
})

test.describe("legacy Drill compatibility", () => {
  test("preserves a provable Target in Guided Practice", async ({ page }) => {
    await page.goto("/drill?keys=x&policy=cold&length=30&rm=opaque")

    await expect(page).toHaveURL(/\/practice\?target=key.*keys=x.*policy=cold.*length=30.*rm=opaque/)
    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "guided")
    await expect(page.getByTestId("practice-focus-summary")).toContainText("x")
  })

  test("sends legacy endurance and timed warm-ups to ordinary Home Tests", async ({ page }) => {
    await page.goto("/drill?target=endurance&shortSeconds=30&longSeconds=60&policy=cold")
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "timed" })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "60" })).toHaveAttribute("aria-pressed", "true")

    await page.goto("/drill?seconds=15")
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true")
  })

  test("lands truthfully when no Target can be proved", async ({ page }) => {
    await page.goto("/drill?target=gram&gram=x")
    await expect(page).toHaveURL(/\/practice$/)
    await expect(page.getByTestId("practice-empty")).toContainText("Find your focus")
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
      expect(start).toBeGreaterThan(0)
      expect(start + gram.length).toBeLessThan(token.length)
    })
  })

  test("uses a borderless control band and moves the one-line focus summary to the Keys editor", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Practice keys", exact: true })).toBeVisible()
    await expect(controls).not.toHaveClass(/rounded|border|bg-base-200/)
    await expect(run).not.toHaveClass(/rounded|border|bg-base-200/)
    await expect(controls.getByRole("button", { name: "60s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Varied" })).toHaveClass(/text-primary/)
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
    await controls.getByRole("button", { name: "Pseudo" }).click()
    await page.getByRole("button", { name: /^q key, available/ }).click()
    await expect(focusSummary).toContainText("+3")

    await page.reload()
    await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
    await expect(controls.getByRole("button", { name: "30s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)
    await expect(page.getByRole("button", { name: /^q key, selected focus/ })).toBeVisible()
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
    await gotoPractice(page)
    const controls = page.getByRole("region", { name: "Practice controls" })
    await controls.getByRole("button", { name: "Grams" }).click()
    const gramEditor = page.getByRole("region", { name: "Gram editor" })
    await expect(page.getByTestId("selected-practice-grams")).toHaveCount(1)
    await expect(gramEditor.getByTestId("selected-practice-grams")).toBeVisible()
    await page.getByTestId("practice-focus-summary").click()
    await expect(page.getByTestId("custom-gram-input")).toBeFocused()

    await expect(page.getByTestId("selected-practice-grams")).toContainText("th")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("2-Gram").first()).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("3-Gram").first()).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("4-Gram").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Common in English" })).toBeVisible()
    await expect(page.getByText(/Frequency-ranked Custom material/)).toHaveCount(0)
    await expect(page.getByText(/Only Grams measured directly/)).toHaveCount(0)
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
    await expect(controls.getByRole("button", { name: "60s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Varied" })).toHaveClass(/text-primary/)
    await controls.getByRole("button", { name: "Grams" }).click()
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)
    await expect(page.getByTestId("selected-practice-grams")).toContainText("er")
    await expect(page.getByTestId("selected-practice-grams")).toContainText("ing")

    await expect(controls.getByRole("button", { name: /source|scope|combination|repetition|threshold/i })).toHaveCount(0)
  })

  test("remembers only directly entered Grams as compact guest Recent choices", async ({ page }) => {
    await page.goto("/practice?custom=grams")
    await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
    await expect(page.getByTestId("recent-custom-grams")).toHaveCount(0)

    const editor = page.getByRole("region", { name: "Gram editor" })
    const input = page.getByTestId("custom-gram-input")
    await input.fill(" ER ")
    await editor.getByRole("button", { name: "Add" }).click()

    const recent = page.getByTestId("recent-custom-grams")
    await expect(recent.getByRole("button")).toHaveText(["er2"])
    await expect(recent.getByRole("button", { name: "er, 2-Gram" })).toHaveAttribute("aria-pressed", "true")

    await page.getByTestId("common-language-grams").getByRole("button").first().click()
    await expect(recent.getByRole("button")).toHaveCount(1)

    await input.fill("ing")
    await input.press("Enter")
    await input.fill("er")
    await input.press("Enter")
    await expect(recent.getByRole("button")).toHaveText(["er2", "ing3"])

    await page.reload()
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er2", "ing3"])

    await page.evaluate(() => {
      const payload = JSON.parse(window.localStorage.getItem("typecafe:practice:recent-custom-grams")!) as { version: 1, languages: Record<string, unknown> }
      payload.languages.french = { version: 1, language: "french", entries: [{ gram: "éé", lastUsedAt: 30 }] }
      window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify(payload))
      window.localStorage.setItem("typecafe:language", JSON.stringify("french"))
      window.dispatchEvent(new Event("typecafe:language-changed"))
    })
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["éé2"])
    await expect(page.getByRole("heading", { name: "Common in French" })).toBeVisible()
  })

  test("restores each guest language's complete Custom Grams setup", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("typecafe:practice:recent-custom-grams", JSON.stringify({
      version: 2,
      languages: {
        english: { version: 2, language: "english", entries: [], setup: { grams: ["th"], durationSeconds: 30, textStyle: "varied", updatedAt: 10 } },
        french: { version: 2, language: "french", entries: [], setup: { grams: ["éé"], durationSeconds: 240, textStyle: "pseudo", updatedAt: 20 } },
      },
    })))
    await page.goto("/practice?custom=grams")
    const controls = page.getByRole("region", { name: "Practice controls" })

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th, 2-Gram")).toBeVisible()
    await expect(controls.getByRole("button", { name: "30s" })).toHaveClass(/text-primary/)
    await setPracticeLanguage(page, "french")
    await expect(page.getByRole("heading", { name: "Common in French" })).toBeVisible()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove éé, 2-Gram")).toBeVisible()
    await expect(controls.getByRole("button", { name: "240s" })).toHaveClass(/text-primary/)
    await expect(controls.getByRole("button", { name: "Pseudo" })).toHaveClass(/text-primary/)

    await controls.getByRole("button", { name: "120s" }).click()
    await setPracticeLanguage(page, "english")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th, 2-Gram")).toBeVisible()
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

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th, 2-Gram")).toBeVisible()
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été, 3-Gram")).toBeVisible()
    await expect(controls.getByRole("button", { name: "120s" })).toHaveClass(/text-primary/)
    await expect.poll(() => pendingCustomGramsSetupTimestamp(page, "french")).toBeNull()

    await setPracticeLanguage(page, "english")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th, 2-Gram")).toBeVisible()
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été, 3-Gram")).toBeVisible()

    await page.evaluate(() => window.localStorage.removeItem("typecafe:practice:recent-custom-grams"))
    await page.reload()
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove été, 3-Gram")).toBeVisible()
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
    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove th, 2-Gram")).toBeVisible()

    delays["customGramsPreference.get"] = 800
    await setPracticeLanguage(page, "french")
    await expect(page.getByTestId("custom-grams-setup-loading")).toBeVisible()
    await expect(page.getByRole("region", { name: "Practice controls" })).toHaveCount(0)

    await expect(page.getByTestId("selected-practice-grams").getByLabel("Remove éé, 2-Gram")).toBeVisible()
    await expect(page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "240s" })).toHaveClass(/text-primary/)
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
    await expect(recent.getByRole("button")).toHaveText(["er2", "th2"])
    await expect.poll(() => pendingRecentGrams(page, "english")).toEqual([])

    await page.evaluate(() => window.localStorage.removeItem("typecafe:practice:recent-custom-grams"))
    await page.reload()
    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er2", "th2"])
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

    await expect(page.getByTestId("recent-custom-grams").getByRole("button")).toHaveText(["er2", "th2"])
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
    await expect(page.getByRole("button", { name: "Stop run" })).toBeVisible()
    await expect(page.getByRole("group", { name: "Text style" }).getByRole("button", { name: "Pseudo" })).toBeDisabled()
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
    await expect(recap.getByRole("button", { name: "Repeat with fresh text" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
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
    await expect(page.getByRole("region", { name: "Gram editor" })).toBeVisible()
    if (testInfo.project.name.startsWith("mobile")) {
      expect(await page.evaluate(() => ({
        fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        scrollX: window.scrollX,
      }))).toEqual({ fits: true, scrollX: 0 })
    }
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
    await page.getByRole("region", { name: "Gram editor" }).getByRole("button", { name: "Add" }).click()
    await expect(workspace).toHaveAttribute("data-practice-kind", "custom")
    await expect(page.getByRole("heading", { name: "Practice Grams", exact: true })).toBeVisible()
    await expect(page.getByText("Changed to Custom Practice", { exact: true })).toBeVisible()
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
    await page.getByRole("region", { name: "Gram editor" }).getByRole("button", { name: "Add" }).click()
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
