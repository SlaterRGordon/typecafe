import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";
import english1k from "../../src/components/typer/languages/english1k.json";

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
  await expect(page.locator("#words .char").first()).toBeVisible();
}

// Mode switches inline on the main page; everything else lives in the modal.
// Quotes is now a text source in the language picker rather than a mode button.
async function selectQuotesLanguage(page: Page) {
  await page.getByTestId("typer-toolbar").getByRole("button", { name: /^Language:/ }).click();
  await page.getByTestId("language-menu").getByRole("button", { name: "Quotes", exact: true }).click();
}

function selectMode(page: Page, name: "Timed" | "Words" | "Practice" | "Grams", options?: { force?: boolean }) {
  const button = page.getByTestId("mode-bar").getByRole("button", { name });
  if (options?.force) return button.evaluate((element: HTMLElement) => element.click());
  return button.click();
}

async function setToolbarCustomLength(page: Page, value: string) {
  await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
  const input = page.locator("#customLengthInput");
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press("Enter");
}

async function openSettingsMenu(page: Page) {
  await page.getByTestId("typer-toolbar").getByRole("button", { name: "Open typing settings" }).click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
}

async function typeWrongZeroes(page: Page, count: number) {
  await expect(page.locator("#c0")).not.toHaveClass(/text-secondary/);
  await page.locator("#input").focus();
  await expect(async () => {
    await page.keyboard.press("0");
    await expect(page.locator("#c0")).toHaveClass(/text-secondary/, { timeout: 250 });
  }).toPass({ timeout: 5_000 });

  for (let i = 1; i < count; i++) await page.keyboard.press("0");
}

test.describe("home typing test", () => {
  test("renders typing text and advances when the active character is typed", async ({ page }) => {
    await gotoHome(page);

    await expect(page.locator("#c0")).toHaveClass(/active-char/);

    await typeCurrentCharacter(page);

    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/active-char/);
  });

  test("restart resets typed character state", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);

    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });

  test("returning to a persisted grams mode loads grams text, not normal words", async ({ page }) => {
    // Regression: settings load in an effect after mount, so the typer first mounts
    // in the default (normal) mode and must switch. The restart coalescing has to
    // keep the *latest* (grams) config - the old first-fired-wins flag loaded the
    // 500-char normal buffer over the returning grams drill (mode 2 = ngrams).
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ mode: 2 }));
    });
    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    // Grams renders its own progress bar + running-average stat; normal never does.
    await expect(page.getByTestId("gram-progress")).toBeVisible();
    await expect(page.getByTestId("stat-avg")).toBeVisible();
    // A gram is a couple of characters; the normal buffer would be ~500.
    const text = (await page.locator("#words").innerText()).trim();
    expect(text.length).toBeLessThan(20);
  });

  test("grams mode derives grams in the active language", async ({ page }) => {
    // A French guest returning to a persisted grams drill. The grams must derive
    // from the French list (no static French gram files) and render - an under-deep
    // derivation would index past its list and print "undefined".
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:language", JSON.stringify("french"));
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ mode: 2 }));
    });
    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await expect(page.getByTestId("gram-progress")).toBeVisible();
    const text = (await page.locator("#words").innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(20); // a gram, not the ~500-char normal buffer
    expect(text).not.toContain("undefined");
  });

  test("Tab+Space restarts the test (Tab swallows the chord key)", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);

    await page.keyboard.down("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.up("Tab");

    // Tab+Space restarts (back to the first character) - the Space is consumed by
    // the restart chord, not typed against the test.
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
    await expect(page.locator("#words .text-secondary")).toHaveCount(0);
  });

  test("Tab+Space restarts even when the space event beats Tab (chord race)", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);

    // A near-simultaneous chord can reach the page with the space keydown ahead
    // of Tab. page.keyboard always fires in call order, so dispatch synthetic
    // keydowns in the racing order to prove the hook still restarts.
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });

  test("toolbar owns mode, length, language, and right-side actions", async ({ page }) => {
    await gotoHome(page);

    const modeBar = page.getByTestId("mode-bar");
    const toolbar = page.getByTestId("typer-toolbar");
    await expect(modeBar.getByRole("button", { name: "Timed" })).toHaveAttribute("aria-pressed", "true");
    await expect(modeBar.getByRole("button", { name: "Normal" })).toHaveCount(0);
    await expect(toolbar.getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true");

    // Words owns its length options in the settings line.
    await selectMode(page, "Words", { force: true });
    await expect(modeBar.getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await toolbar.getByRole("button", { name: "25" }).click();
    await expect(toolbar.getByRole("button", { name: "25" })).toHaveAttribute("aria-pressed", "true");

    const context = page.getByTestId("toolbar-context");
    await context.getByRole("button", { name: "Custom" }).click();
    const customInput = page.locator("#customLengthInput");
    await expect(customInput).toBeVisible();
    await customInput.fill("6000");
    // Enter commits (clamped to the max) and collapses the editor; the custom
    // option stays selected because the length is non-preset.
    await customInput.press("Enter");
    await expect(customInput).toHaveValue("5000");
    await expect(page.getByTestId("custom-length-panel")).toHaveAttribute("aria-hidden", "true");
    await expect(context.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");

    // Language is chosen globally in the nav; the settings-line control picks size.
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "Spanish" }).click();
    await expect(toolbar.getByRole("button", { name: "Language: Spanish" })).toBeVisible();

    // The gear dropdown holds only the text add-ons (no display toggles).
    await openSettingsMenu(page);
    const settingsMenu = page.getByTestId("settings-menu");
    await expect(settingsMenu.getByText("Text")).toBeVisible();
    await expect(settingsMenu.getByText("Display")).toHaveCount(0);
    await expect(settingsMenu.getByRole("button", { name: /punctuation/ })).toBeVisible();
    await expect(settingsMenu.getByRole("button", { name: /capitals/ })).toBeVisible();
    await expect(settingsMenu.getByRole("button", { name: /numbers/ })).toBeVisible();
    await toolbar.getByRole("button", { name: "Open typing settings" }).click();
    await expect(settingsMenu).toBeHidden();
    await openSettingsMenu(page);
    await page.keyboard.press("Escape");
    await expect(settingsMenu).toBeHidden();
    await openSettingsMenu(page);
    await page.mouse.click(8, 8);
    await expect(settingsMenu).toBeHidden();

    await toolbar.getByRole("button", { name: "Restart test" }).click();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await toolbar.getByRole("button", { name: "Enter fullscreen" }).click();
    await expect(toolbar.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
    await toolbar.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(toolbar.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();

    // Grams: sources and scopes are settings-line text segments; the numeric
    // knobs live on the advanced line below (grams-panel).
    await selectMode(page, "Grams");
    await expect(page.getByTestId("grams-panel")).toBeVisible();
    await expect(context.getByRole("button", { name: "bigrams" })).toHaveAttribute("aria-pressed", "true");
  });

  test("language icon shows only on word-list modes", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByTestId("typer-toolbar");
    const langButton = toolbar.getByRole("button", { name: /^Language:/ });

    // Timed (default), Words use a word list → icon shown; ∞ (no timer) keeps it.
    await expect(langButton).toBeVisible();
    await selectMode(page, "Words", { force: true });
    await expect(langButton).toBeVisible();
    await page.getByTestId("toolbar-context").getByRole("button", { name: "Infinite words" }).click();
    await expect(langButton).toBeVisible();

    // Grams + Practice generate from n-grams / selected keys → icon hidden.
    await selectMode(page, "Grams");
    await expect(langButton).toHaveCount(0);
    await selectMode(page, "Practice");
    await expect(langButton).toHaveCount(0);

    // Quotes is a text source in the picker, so the icon stays - now labelled Quotes.
    await selectMode(page, "Timed");
    await selectQuotesLanguage(page);
    await expect(toolbar.getByRole("button", { name: "Language: Quotes" })).toBeVisible();
  });

  test("Quotes text source swaps the length presets for length buckets and types verbatim", async ({ page }) => {
    await gotoHome(page);

    await selectQuotesLanguage(page);
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: Quotes" })).toBeVisible();

    // The length buckets replace the timed/word presets.
    const bucketBar = page.getByTestId("quote-length-bar");
    await expect(bucketBar.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await bucketBar.getByRole("button", { name: "Short" }).click();
    await expect(bucketBar.getByRole("button", { name: "Short" })).toHaveAttribute("aria-pressed", "true");

    // A quote loads as real prose - capitals and punctuation survive (the typer
    // lowercases word-list text, so an uppercase char proves it's a verbatim quote).
    await expect(page.locator("#words")).toContainText(/[A-Z]/);
  });

  test("English exposes vocabulary sizes that load on demand", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByTestId("typer-toolbar");

    // Default English is the bundled curated 1k slice.
    await toolbar.getByRole("button", { name: "Language: English 1k" }).click();
    const menu = page.getByTestId("language-menu");
    await expect(menu).toBeVisible();
    for (const size of ["1k", "5k", "10k", "25k"]) {
      await expect(menu.getByRole("button", { name: `English ${size}`, exact: true })).toBeVisible();
    }

    // Picking a larger slice updates the label and keeps a renderable test
    // (the 25k word list loads lazily as its own chunk).
    await menu.getByRole("button", { name: "English 25k", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Language: English 25k" })).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
  });

  test("landing on /?mode=grams starts in grams, not a words flash", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/?mode=grams");

    // The grams subpanel + Grams mode are the steady state; the typer never
    // settles into a words test on the way in.
    await expect(page.getByTestId("grams-panel")).toBeVisible();
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Grams" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#words .char").first()).toBeVisible();
  });

  test("does not log a score when switching modes mid-test", async ({ page }) => {
    let scoreCreates = 0;

    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      onProcedure: (procedure) => {
        if (procedure === "test.create") scoreCreates += 1;
      },
    });
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await selectMode(page, "Words", { force: true });
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");

    expect(scoreCreates).toBe(0);

    await selectMode(page, "Timed", { force: true });
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Timed" })).toHaveAttribute("aria-pressed", "true");

    expect(scoreCreates).toBe(0);
  });

  test("signed-in users get today's targeted coaching session", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    if (testInfo.project.name.includes("mobile")) {
      const inlineTab = page.getByTestId("home-coach-tab-daily-inline");
      await expect(inlineTab).toBeVisible();
      await expect(inlineTab).toContainText("Warm up: 30-second Test");
      await expect(inlineTab.getByRole("link", { name: "Start session" })).toHaveAttribute("href", "/?mode=timed&count=30");
      return;
    }

    const tab = page.getByTestId("home-coach-tab-daily");
    await expect(tab).toBeVisible();
    const collapsedLink = tab.getByRole("link", { name: "Today's coaching" });
    await expect(collapsedLink).toHaveAttribute("href", "/?mode=timed&count=30");
    await expect(tab.getByText("0/2")).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-daily-panel");
    await expect(collapsedLink).toHaveCSS("opacity", "0");
    await expect(panel).toContainText("Warm up: 30-second Test");
    await expect(panel).toContainText("about 4 min");
    await expect(panel.getByRole("link", { name: "Start session" })).toHaveAttribute("href", "/?mode=timed&count=30");
  });

  test("signed-in users get a coach tab that drills their slowest transition", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    if (testInfo.project.name.includes("mobile")) {
      const inlineTab = page.getByTestId("home-coach-tab-drill-inline");
      await expect(inlineTab).toBeVisible();
      await expect(inlineTab.getByText("Fix this")).toBeVisible();
      await expect(inlineTab).toContainText("b->r");
      await expect(inlineTab.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?transitions=br");
      await inlineTab.getByRole("button", { name: "Dismiss drill suggestion" }).click();
      await expect(inlineTab).toBeHidden();
      return;
    }

    const tab = page.getByTestId("home-coach-tab-drill");
    await expect(tab).toBeVisible();
    const collapsedLink = tab.getByRole("link", { name: "Targeted drill" });
    await expect(collapsedLink).toHaveAttribute("href", "/drill?transitions=br");
    const collapsedLabel = tab.getByText("Fix this");
    await expect(collapsedLabel).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-drill-panel");
    await expect(collapsedLink).toHaveCSS("opacity", "0");
    await expect(panel).toContainText("b->r");
    await expect(panel).toContainText("2.2x avg");
    await expect(panel.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?transitions=br");

    // Dismissible - and stays gone for the session.
    await panel.getByRole("button", { name: "Dismiss drill suggestion" }).click();
    await expect(tab).toBeHidden();
  });

  test("guests without history see no drill coach tab", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);
    await expect(page.getByTestId("home-coach-tab-drill")).toBeHidden();
    await expect(page.getByTestId("home-coach-tab-drill-inline")).toBeHidden();
  });

  test("guests with local history get the drill coach tab", async ({ page }, testInfo) => {
    // Local-first: same transitions the signed-in mock serves, seeded as guest evidence.
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:transitionStats", JSON.stringify([
        { pair: "br", count: 12, totalMs: 4800, errors: 3 },
        { pair: "th", count: 30, totalMs: 3000, errors: 0 },
        { pair: "he", count: 25, totalMs: 3000, errors: 0 },
        { pair: "io", count: 10, totalMs: 3000, errors: 1 },
      ]));
    });
    await mockTrpc(page);
    await gotoHome(page);

    if (testInfo.project.name.includes("mobile")) {
      const inlineTab = page.getByTestId("home-coach-tab-drill-inline");
      await expect(inlineTab).toBeVisible();
      await expect(inlineTab).toContainText("b->r");
      await expect(inlineTab.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?transitions=br");
      return;
    }

    const tab = page.getByTestId("home-coach-tab-drill");
    await expect(tab).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-drill-panel");
    await expect(panel).toContainText("b->r");
    await expect(panel.getByRole("link", { name: "Start drill" })).toHaveAttribute("href", "/drill?transitions=br");
  });

  test("desktop coach tabs persist after leaving home", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Rail coach tabs are desktop-only.");
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    await expect(page.getByTestId("home-coach-tab-daily")).toBeVisible();
    const nav = page.getByTestId("side-primary-nav");
    const tabBox = await page.getByTestId("home-coach-tab-daily").boundingBox();
    const dailyBox = await nav.getByRole("link", { name: "Daily coaching" }).boundingBox();
    const progressBox = await nav.getByRole("link", { name: "Progress" }).boundingBox();
    expect(tabBox).not.toBeNull();
    expect(dailyBox).not.toBeNull();
    expect(progressBox).not.toBeNull();
    // Each flyout is its nav entry's live detail - it sits beside it: the
    // daily tab beside Daily Coach, the drill tab beside Progress.
    const tabCenterY = tabBox!.y + tabBox!.height / 2;
    const dailyCenterY = dailyBox!.y + dailyBox!.height / 2;
    const progressCenterY = progressBox!.y + progressBox!.height / 2;
    expect(Math.abs(tabCenterY - dailyCenterY)).toBeLessThanOrEqual(2);
    expect(Math.abs(tabCenterY - progressCenterY)).toBeGreaterThan(16);
    const drillBox = await page.getByTestId("home-coach-tab-drill").boundingBox();
    expect(drillBox).not.toBeNull();
    const drillCenterY = drillBox!.y + drillBox!.height / 2;
    expect(Math.abs(drillCenterY - progressCenterY)).toBeLessThanOrEqual(2);
    await page.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByTestId("headline-delta")).toBeVisible();

    const tab = page.getByTestId("home-coach-tab-daily");
    await expect(tab).toBeVisible();
    await tab.hover();
    await expect(page.getByTestId("home-coach-tab-daily-panel")).toContainText("Warm up: 30-second Test");
  });

  // Honest-review #1 (honest-review-2026-07.md): a zero-history visitor must
  // see the promise before the first keystroke - and never again once any
  // evidence exists.
  test("zero-history guests see the promise line", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);
    await expect(page.getByTestId("first-visit-promise")).toContainText("what's slowing you down");
  });

  test("the promise line is gone once local history or an account exists", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:keyStats", JSON.stringify([
        { key: "a", attempts: 10, correct: 9 },
      ]));
    });
    await mockTrpc(page);
    await gotoHome(page);
    await expect(page.getByTestId("first-visit-promise")).toHaveCount(0);

    // Signed in (even with no local history) → also gone.
    await page.evaluate(() => window.localStorage.clear());
    await mockAuthenticatedSession(page);
    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await expect(page.getByTestId("first-visit-promise")).toHaveCount(0);
  });

  test("guests without history get a calibration coach tab", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await gotoHome(page);
    const testId = testInfo.project.name.includes("mobile") ? "home-coach-tab-daily-inline" : "home-coach-tab-daily";
    const tab = page.getByTestId(testId);
    await expect(tab).toBeVisible();
    await expect(tab).toContainText("Map your typing");
  });

  test("guests with local history get a frozen targeted daily session", async ({ page }, testInfo) => {
    // Local-first: same transitions the signed-in mock serves, seeded as guest evidence.
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:transitionStats", JSON.stringify([
        { pair: "br", count: 12, totalMs: 4800, errors: 3 },
        { pair: "th", count: 30, totalMs: 3000, errors: 0 },
        { pair: "he", count: 25, totalMs: 3000, errors: 0 },
        { pair: "io", count: 10, totalMs: 3000, errors: 1 },
      ]));
    });
    await mockTrpc(page);
    await gotoHome(page);

    if (testInfo.project.name.includes("mobile")) {
      const inlineTab = page.getByTestId("home-coach-tab-daily-inline");
      await expect(inlineTab).toBeVisible();
      await expect(inlineTab).toContainText("Warm up: 30-second Test");
      return;
    }

    const tab = page.getByTestId("home-coach-tab-daily");
    await expect(tab).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-daily-panel");
    await expect(panel).toContainText("Warm up: 30-second Test");
    const stored: unknown = await page.evaluate(() => JSON.parse(window.localStorage.getItem("typecafe:dailyCoaching:guest") ?? "[]") as unknown);
    expect(Array.isArray(stored)).toBe(true);
    const first = (stored as Array<{ kind?: string, reason?: string }>)[0];
    expect(first?.kind).toBe("targeted");
    expect(first?.reason).toContain("b→r");
  });

  test("grams numeric knobs edit inline on the advanced line", async ({ page }) => {
    await gotoHome(page);
    await selectMode(page, "Grams");
    const panel = page.getByTestId("grams-panel");
    await expect(panel).toBeVisible();

    // Source + scope are settings-line segments; the knobs render as
    // dotted-underline values until clicked.
    const context = page.getByTestId("toolbar-context");
    await expect(context.getByRole("button", { name: "bigrams" })).toHaveAttribute("aria-pressed", "true");
    await expect(context.getByRole("button", { name: "top 50" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#testGramWpmThresholdInput")).toHaveCount(0);

    // Click-to-edit: commit on Enter, and the new value renders back as text.
    await panel.getByRole("button", { name: "Edit WPM needed to advance" }).click();
    const input = page.locator("#testGramWpmThresholdInput");
    await expect(input).toBeVisible();
    await input.fill("35");
    await input.press("Enter");
    await expect(panel.getByRole("button", { name: "Edit WPM needed to advance" })).toContainText("35 wpm");
  });

  test("keyboard layout is chosen globally in the nav and persists", async ({ page }) => {
    await gotoHome(page);

    // Default trigger names the layout; picking another updates it app-wide.
    const trigger = page.getByTestId("nav-layout-trigger");
    await expect(trigger).toHaveText(/QWERTY/);
    await trigger.click();
    await page.getByTestId("nav-layout-menu").getByRole("button", { name: "Colemak", exact: true }).click();
    await expect(trigger).toHaveText(/Colemak/);

    // Local-first: the choice survives a reload.
    await page.reload();
    await expect(page.getByTestId("nav-layout-trigger")).toHaveText(/Colemak/);
  });

  test("auto layout follows the language; an explicit pick stays pinned", async ({ page }) => {
    await gotoHome(page);

    // Fresh visitor: layout is Auto, resolving to QWERTY for English.
    const trigger = page.getByTestId("nav-layout-trigger");
    await expect(trigger).toHaveText(/Auto - QWERTY/);

    // Switching the language to German flips the auto board to QWERTZ …
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "German" }).click();
    await expect(trigger).toHaveText(/Auto - QWERTZ \(DE\)/);

    // … and the practice board grows real umlaut keys (with an AltGr layer).
    await selectMode(page, "Practice");
    const board = page.locator(".typecafe-keyboard");
    await expect(board.locator('[data-kb-key="ü"]')).toBeVisible();
    await expect(board.locator('[data-kb-key="ö"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Show AltGr keys (accents and symbols)" })).toHaveAttribute("aria-pressed", "false");

    // An explicit pick pins: QWERTY stays through a language change (no AZERTY),
    // and the umlaut keys leave the board.
    await trigger.click();
    await page.getByTestId("nav-layout-menu").getByRole("button", { name: "QWERTY", exact: true }).click();
    await expect(trigger).toHaveText(/^QWERTY$/);
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "French" }).click();
    await expect(trigger).toHaveText(/^QWERTY$/);
    await expect(board.locator('[data-kb-key="ü"]')).toHaveCount(0);
  });

  test("detected national layout seeds the language until the user has chosen one", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:layout-detected", JSON.stringify("qwertz-de"));
    });
    await gotoHome(page);

    await expect(page.getByTestId("nav-layout-trigger")).toHaveText(/Auto - QWERTZ \(DE\)/);
    await expect(page.getByTestId("nav-language-trigger")).toHaveAttribute("aria-label", "Language: German");
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: German" })).toBeVisible();

    await page.evaluate(() => window.localStorage.clear());
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:layout-detected", JSON.stringify("qwertz-de"));
      window.localStorage.setItem("typecafe:language", JSON.stringify("english"));
    });
    await page.reload();
    await expect(page.getByTestId("nav-layout-trigger")).toHaveText(/Auto - QWERTZ \(DE\)/);
    await expect(page.getByTestId("nav-language-trigger")).toHaveAttribute("aria-label", "Language: English");
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" })).toBeVisible();
  });

  test("practice counts an unlocked umlaut toward the selection floor and toggles dead-key accents", async ({ page }) => {
    await page.addInitScript(() => {
      // A minimal valid pool: adding ü makes für a permitted German word.
      window.localStorage.setItem("typecafe:language", JSON.stringify("german"));
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ selectedKeys: [..."abcdfgir", "ü"] }));
    });
    await gotoHome(page);

    // German + auto layout renders QWERTZ; umlauts are real keys.
    await expect(page.getByTestId("nav-layout-trigger")).toHaveText(/Auto - QWERTZ \(DE\)/);
    await selectMode(page, "Practice");

    const board = page.locator(".typecafe-keyboard");
    const uml = board.locator('[data-kb-key="ü"]');
    const consonant = board.locator('[data-kb-key="c"]');
    await expect(uml).toBeVisible();
    // Seed only the post-unlock generator: globally replacing Math.random before
    // Home mounts stalls its initial text generator.
    await page.evaluate(() => {
      (window as typeof window & { originalMathRandom?: typeof Math.random }).originalMathRandom = Math.random;
      Math.random = () => 0;
    });
    await expect(uml.locator("svg")).toHaveCount(0);

    // ü is an actual letter anchor: with it expanding the eight-letter pool to
    // nine, one selected ASCII consonant can be locked without an alert.
    await expect(consonant.locator("svg")).toHaveCount(0);
    await consonant.click();
    await expect(consonant.locator("svg")).toHaveCount(1);
    await expect(page.getByTestId("practice-active-count")).toHaveText("8 keys active");
    await expect(page.getByText("Must include at least 8 keys!", { exact: true })).toHaveCount(0);
    await expect(page.locator("#words")).toContainText("für");

    // The regenerated text retains the umlaut word after the floor-allowed removal.
    await page.evaluate(() => {
      const original = (window as typeof window & { originalMathRandom?: typeof Math.random }).originalMathRandom;
      if (original) Math.random = original;
    });

    // French flips the auto board to AZERTY. The unlocked ü rides its physical
    // cap across the switch (QWERTZ ü → AZERTY dead ^), and a dead target cap
    // carries its language's whole composed set (ê â î ô û) - so the circumflex
    // arrives unlocked, one toggle for the set.
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "French" }).click();
    const dead = board.locator('[data-kb-key="^"]');
    await expect(dead).toHaveAttribute("data-kb-dead", "");
    // Unlocked only once the French accent set has loaded and the remap landed.
    await expect(dead.locator("svg")).toHaveCount(0);
    // Locking it drops the whole set in one click; unlocking re-adds it.
    await dead.click();
    await expect(dead.locator("svg")).toHaveCount(1);
    await dead.click();
    await expect(dead.locator("svg")).toHaveCount(0);
  });

  test("settings cover language, text add-ons, practice keyboard, and no-timer length", async ({ page }) => {
    await gotoHome(page);

    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "Spanish" }).click();
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: Spanish" })).toBeVisible();

    // The display toggles are gone: live stats always render under the text and
    // the keyboard is practice-only.
    await openSettingsMenu(page);
    const settingsMenu = page.getByTestId("settings-menu");
    await expect(settingsMenu.getByRole("button", { name: /Live stats/ })).toHaveCount(0);
    await expect(settingsMenu.getByRole("button", { name: /Keyboard/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(settingsMenu).toBeHidden();

    await expect(page.getByTestId("live-stats")).toBeVisible();
    await expect(page.locator(".typecafe-keyboard")).toHaveCount(0);

    // Mode switches on the inline bar, no modal round-trip.
    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // Practice exposes both text add-ons - the punctuation toggle gates the
    // locked mark keys, so it must be reachable (not just capitals).
    await openSettingsMenu(page);
    const practiceSettings = page.getByTestId("settings-menu");
    const practicePunct = practiceSettings.getByRole("button", { name: /punctuation/ });
    await expect(practicePunct).toBeVisible();
    await expect(practicePunct).toHaveAttribute("aria-pressed", "false");
    await practicePunct.click();
    await expect(practicePunct).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(practiceSettings).toBeHidden();

    // ∞ (no timer) runs the relaxed engine while keeping the Timed sub-mode lit,
    // and shows an elapsed count-up clock instead of a countdown.
    await selectMode(page, "Timed");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "No timer" }).click();
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "No timer" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Timed" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("stat-time")).toBeVisible();
  });

  test("Timed ∞ runs a rising count-up clock", async ({ page }) => {
    await gotoHome(page);
    await page.getByTestId("toolbar-context").getByRole("button", { name: "No timer" }).click();
    await expect(page.getByTestId("stat-time")).toHaveText("0");

    // Typing starts the stopwatch; it must tick upward, not sit at 0.
    await typeCurrentCharacter(page);
    await expect(page.getByTestId("stat-time")).not.toHaveText("0", { timeout: 4000 });
  });

  // Phase 2 regression: the toolbar moved inside #typer, where Text.tsx's
  // click/keydown handlers used to yank focus back to the hidden typing input -
  // making the custom-length field uneditable (only the first digit ever landed).
  test("custom length input stays focused and editable while typing", async ({ page }) => {
    await gotoHome(page);

    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    const input = page.locator("#customLengthInput");
    await expect(input).toBeVisible();

    await input.click();
    await expect(input).toBeFocused();

    // Real, per-keystroke typing (not fill) - this is what the focus-steal broke:
    // a stolen focus would drop every digit after the first, leaving "4" not "45".
    await input.fill("");
    await input.pressSequentially("45");
    await expect(input).toHaveValue("45");
    await expect(input).toBeFocused();

    // Enter commits the value and closes the editor panel.
    await input.press("Enter");
    await expect(input).toHaveValue("45");
    await expect(page.getByTestId("custom-length-panel")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:testSettings")),
    ).toContain('"count":45');
  });

  // Phase 2 regression: the dropdown menus and the custom-length slide-over were
  // semi-transparent (bg-*/95), so the typing text bled through. They must be
  // fully opaque.
  test("toolbar menus and the custom-length panel are fully opaque", async ({ page }) => {
    await gotoHome(page);

    const isOpaque = (color: string) => {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (!match) return true;
      const parts = match[1]!.split(",").map((part) => part.trim());
      return parts.length < 4 || parseFloat(parts[3]!) === 1;
    };
    const backgroundOf = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => getComputedStyle(el).backgroundColor);

    await openSettingsMenu(page);
    expect(isOpaque(await backgroundOf("settings-menu"))).toBe(true);
    await page.keyboard.press("Escape");

    await page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" }).click();
    await expect(page.getByTestId("language-menu")).toBeVisible();
    expect(isOpaque(await backgroundOf("language-menu"))).toBe(true);
    await page.keyboard.press("Escape");

    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    await expect(page.locator("#customLengthInput")).toBeVisible();
    expect(isOpaque(await backgroundOf("custom-length-panel"))).toBe(true);

    // The unit label and a distinct cancel control are separate elements (the
    // cancel used to read as glued onto the "sec" label).
    const panel = page.getByTestId("custom-length-panel");
    await expect(panel.getByText("sec")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Cancel custom length" })).toBeVisible();
  });

  test("test settings persist across a reload", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true }).click();
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:testSettings")),
    ).toContain('"count":25');

    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();

    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("numbers guarantee practice and remain visible on the result", async ({ page }) => {
    await gotoHome(page);
    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "10", exact: true }).click();
    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /numbers/ }).click();
    await page.keyboard.press("Escape");

    await expect(page.locator("#words")).toContainText(/\d/);
    await typeVisibleTestText(page);
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible();
    await expect(page.getByText("Numbers", { exact: true })).toBeVisible();
  });

  // Honest-review 2026-07 §2: flattery shares the ranking quality bar. A 3s
  // custom test is unranked, and the mocked save still returns a brag, delta,
  // and streak - none of them may render on an unranked card.
  test("an unranked test wears no flattery chips", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    await setToolbarCustomLength(page, "3");
    await page.locator("#text").click();
    // The commit's restart can drop the first keystroke; wait for readiness,
    // then press until it lands.
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(async () => {
      await typeCurrentCharacter(page);
      await expect(page.locator("#c0")).not.toHaveClass(/active-char/, { timeout: 500 });
    }).toPass({ timeout: 5_000 });

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Unranked")).toBeVisible();
    await expect(page.getByTestId("avg-delta")).toHaveCount(0);
    await expect(page.getByTestId("score-streak")).toHaveCount(0);
    await expect(page.getByText("similar starters")).toHaveCount(0);
  });

  test("timed test completes when the timer expires", async ({ page }) => {
    await gotoHome(page);

    // Shorten the test to 3 seconds via a custom timed length.
    await setToolbarCustomLength(page, "3");

    // Start the test; the countdown should expire and show the score card even
    // though the text is nowhere near finished.
    await page.locator("#text").click();
    await typeCurrentCharacter(page);
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 10_000 });
  });

  // Regression guards for the live-accuracy undercount (phase-0-trust.md 0.1):
  // the first keystroke used to be dropped from the counts by a `position > 0`
  // guard, so 3-of-4 correct read 50% and a wrong first key was free.
  test("counts the first keystroke: 3 correct + 1 wrong shows 75% live accuracy", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page, 0);
    await typeCurrentCharacter(page, 1);
    await typeCurrentCharacter(page, 2);
    await typeWrongCharacter(page, 3);

    await expect(page.getByTestId("stat-acc")).toHaveText("75");
  });

  test("an incorrect first keystroke counts against accuracy", async ({ page }) => {
    await gotoHome(page);

    await typeWrongCharacter(page, 0);

    // 0-of-1 correct = 0%; previously the first wrong key didn't register at all.
    await expect(page.getByTestId("stat-acc")).toHaveText("0");
  });

  // Regression guard for the grams micro-sample WPM (phase-0-trust.md 0.1): the
  // default 2-char gram level used to read "500.0 wpm (500.0avg)". A sample that
  // small can't be measured, so WPM and its average must show "-" instead.
  test("grams mode shows - instead of an inflated WPM on a micro-sample level", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Grams");

    await expect(page.locator("#words .char").first()).toBeVisible();
    await typeVisibleTestText(page);

    // The WPM and its running average render "-", never an inflated number like 500.
    await expect(page.getByTestId("stat-wpm")).toHaveText("-");
    await expect(page.getByTestId("stat-avg")).toHaveText("-");
  });

  // Regression guard for the swallowed-save bug (phase-0-trust.md 0.1): a signed-in
  // user whose score save fails used to get a blank screen. The results must still
  // render (unpersisted) and a toast must explain the failure.
  test("a failed score save still shows results, with a toast", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { errorProcedures: ["test.create"] });
    await gotoHome(page);

    // Shorten to a 3s timed test so the timer expiry triggers the (failing) save.
    await setToolbarCustomLength(page, "3");

    // The commit triggers a restart that can drop the first keystroke; wait
    // for readiness, then press until the active char advances.
    await page.locator("#text").click();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(async () => {
      await typeCurrentCharacter(page);
      await expect(page.locator("#c0")).not.toHaveClass(/active-char/, { timeout: 500 });
    }).toPass({ timeout: 5_000 });

    // The toast (auto-dismisses after 5s) is the time-sensitive assertion; check it
    // first, then the results card that should render despite the failed save.
    await expect(page.getByText("Couldn't save your score", { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible();
  });

  // Phase 1.2/1.3 + Slice 5c: a finished test must surface at least one honest
  // finding and a one-click drill that lands on the unified /drill surface built
  // from those keys - the first two clicks of the improvement loop, available to a
  // guest with no account.
  test("diagnosis panel offers a one-click drill on /drill (guest)", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);

    // A short custom timed test, long enough to clear the 30-keystroke floor.
    await setToolbarCustomLength(page, "4");

    // 50 deliberately-wrong keystrokes: every expected key is missed, so several
    // keys land under 100% - enough for an honest "least accurate keys" finding
    // regardless of the (machine-uniform) keystroke timing.
    await typeWrongZeroes(page, 50);

    // Timer expiry renders the results card with the diagnosis panel.
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    await expect(page.getByText("Too short to diagnose")).toHaveCount(0);
    // Phase 1.5: the reusable per-key heatmap renders inside the diagnosis panel.
    await expect(page.getByTestId("diagnosis-heatmap")).toBeVisible();
    await expect(page.getByTestId("diagnosis-panel")).toBeVisible();
    expect(await page.getByTestId("diagnosis-panel").evaluate((panel) => {
      const chart = document.querySelector('[data-testid="wpm-chart"]');
      return chart ? Boolean(panel.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
    })).toBe(true);

    // Toughest-words row: same one-click handoff, but drills those exact words
    // verbatim via /drill?words= (checked by href so we don't navigate away yet).
    const wordsDrill = page.getByRole("link", { name: /Drill these words/ });
    await expect(wordsDrill).toBeVisible();
    await expect(wordsDrill).toHaveAttribute("href", /\/drill\?words=/);

    const drillButton = page.getByRole("link", { name: /Drill these keys/ }).first();
    await expect(drillButton).toBeVisible();
    await drillButton.click();

    // Handoff lands on /drill, ready on the diagnosed keys, and carries the
    // diagnosed test's config (rm token) so Re-measure can round-trip a delta.
    await expect(page).toHaveURL(/\/drill\?/);
    await expect(page).toHaveURL(/[?&]rm=/);
    await expect(page.getByTestId("drill-typer")).toBeVisible();
    await expect(page.getByText("Key drill")).toBeVisible();
  });

  // Regression guard: Practice (and any non-Normal mode) carries a leftover
  // subMode of "timed". Without a Normal-mode gate that drives a decremental
  // countdown to 0 that fires the instant the test starts - rendering a stuck
  // "0" and ending the session immediately. Verify both: no countdown, and the
  // drill keeps running as keys are typed.
  test("practice mode has no countdown and keeps running", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // The countdown counter must not be present.
    await expect(page.getByTestId("timed-countdown")).toHaveCount(0);

    // Typing accrues live stats - proof the session is running, not instantly
    // completed (which would leave the stats pending at "-" forever).
    for (let i = 0; i < 6; i++) await typeCurrentCharacter(page, i);
    await expect(page.getByTestId("stat-acc")).toHaveText("100", { timeout: 3000 });
  });

  // The vertical caret is positioned imperatively (no React render per
  // keystroke - typing-feel §2); guard that it shows, glides forward with a
  // typed character, and blinks only when typing pauses.
  test("vertical caret tracks typing and blinks when idle", async ({ page }) => {
    await gotoHome(page);

    const caret = page.getByTestId("typing-caret");
    await expect(caret).toBeVisible();
    await expect(caret).toHaveClass(/caret-idle/);

    // translate x from the computed transform matrix(a, b, c, d, tx, ty).
    const caretX = async () => caret.evaluate((el) => {
      const transform = getComputedStyle(el).transform;
      return Number(/matrix\(([^)]+)\)/.exec(transform)?.[1]?.split(",")[4] ?? NaN);
    });

    const startX = await caretX();
    expect(startX).not.toBeNaN();
    await typeCurrentCharacter(page, 0);
    await expect(caret).not.toHaveClass(/caret-idle/);
    await expect.poll(caretX).toBeGreaterThan(startX);

    // The blink returns shortly after the last keystroke.
    await expect(caret).toHaveClass(/caret-idle/, { timeout: 2000 });
  });

  // The next-key ring on the practice board is applied imperatively (no React
  // render per keystroke - typing-feel §1); guard that it actually follows.
  test("practice keyboard rings the next expected key as you type", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await expect(page.getByRole("region", { name: "Practice keyboard" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Keyboard layer" })).toBeVisible();
    const qKey = page.locator('.typecafe-key-heatmap [data-kb-key="q"]');
    await expect(qKey).not.toContainText("%");
    await expect(qKey).toHaveAttribute("title", /Base q: no data[\s\S]*Shift Q: no data/);

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    const first = await page.locator("#c0").textContent();
    const firstCell = page.locator(`.typecafe-key-heatmap [data-kb-key="${first}"]`);
    await expect(firstCell).toHaveClass(/ring-primary/);

    await typeCurrentCharacter(page, 0);
    const second = await page.locator("#c1").textContent();
    await expect(page.locator(`.typecafe-key-heatmap [data-kb-key="${second}"]`)).toHaveClass(/ring-primary/);
    if (second !== first) await expect(firstCell).not.toHaveClass(/ring-primary/);
  });

  // Heatmap cells sweep the full theme gradient, so each derives a legible
  // black/white text color from its own background luminance rather than a
  // fixed white that washed out on light cells (aqua's bright-cyan low end).
  test("practice keyboard keys use legible black/white text on any cell color", async ({ page }) => {
    await gotoHome(page);
    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    const cell = page.locator(".typecafe-key-heatmap [data-kb-key]").first();
    await expect(cell).toBeVisible();
    const color = await cell.evaluate((el) => getComputedStyle(el).color);
    expect(["rgb(0, 0, 0)", "rgb(255, 255, 255)"]).toContain(color);
  });

  test("practice remaps a selected cap and keeps text viable after a language layout change", async ({ page }) => {
    // `a` is the only source vowel. Its AZERTY counterpart at the same physical
    // cap is `q`, so the language/layout transition must both move the selection
    // and restore a vowel before Practice regenerates its prompt.
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ selectedKeys: "asdfghjk".split("") }));
    });
    await gotoHome(page);
    await selectMode(page, "Practice");

    const board = page.locator(".typecafe-keyboard");
    const sourceCap = board.locator('[data-kb-cell="a"]');
    await expect(sourceCap).toHaveAttribute("data-kb-key", "a");
    await expect(sourceCap.locator("svg")).toHaveCount(0);

    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "French" }).click();
    await expect(page.getByTestId("nav-layout-trigger")).toHaveText(/Auto - AZERTY \(FR\)/);

    // The source cap's AZERTY physical position is named `q`, not old glyph `a`.
    const remappedCap = board.locator('[data-kb-cell="q"]');
    await expect(remappedCap).toHaveAttribute("data-kb-key", "q");
    await expect(remappedCap.locator("svg")).toHaveCount(0);
    // Remapping must not leave the pseudo-word pool vowel-less / empty.
    await expect(page.locator("#words .char").nth(5)).toBeVisible();
  });

  test("practice sticky layers exclude each other and AZERTY shifted digits unlock", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ selectedKeys: "aeiousdf".split("") }));
    });
    await gotoHome(page);
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "French" }).click();
    await selectMode(page, "Practice");

    const board = page.locator(".typecafe-keyboard");
    const shift = page.getByRole("button", { name: "Show shifted keys (capitals and symbols)" });
    const altgr = page.getByRole("button", { name: "Show AltGr keys (accents and symbols)" });

    await shift.click();
    await expect(shift).toHaveAttribute("aria-pressed", "true");
    await expect(altgr).toHaveAttribute("aria-pressed", "false");
    await expect(board.locator('[data-kb-key="2"]')).toBeVisible();

    await altgr.click();
    await expect(shift).toHaveAttribute("aria-pressed", "false");
    await expect(altgr).toHaveAttribute("aria-pressed", "true");
    await expect(board.locator('[data-kb-key="€"]')).toBeVisible();

    await shift.click();
    await expect(shift).toHaveAttribute("aria-pressed", "true");
    await expect(altgr).toHaveAttribute("aria-pressed", "false");
    const digit = board.locator('[data-kb-key="2"]');
    await expect(digit).toHaveAttribute("role", "button");
    await expect(digit.locator("svg")).toHaveCount(1);
    await digit.click();
    await expect(digit.locator("svg")).toHaveCount(0);
    // Unlocking a digit while the numbers add-on is off flips it on in the same
    // click - no gear-menu trip.
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:testSettings")),
    ).toContain('"numbers":true');
  });

  test("practice: toggled-off add-ons lock their keys; unlocking flips the add-on on", async ({ page }) => {
    await gotoHome(page);
    await selectMode(page, "Practice");
    const board = page.locator(".typecafe-keyboard");
    await expect(board).toBeVisible();
    const settings = () => page.evaluate(() => window.localStorage.getItem("typecafe:testSettings"));

    // Numbers off (default) → every digit key reads locked; one click unlocks
    // the key AND turns the numbers add-on on.
    const seven = board.locator('[data-kb-key="7"]');
    await expect(seven).toHaveAttribute("data-kb-state", "locked");
    await expect(seven).toHaveAttribute("aria-pressed", "false");
    await expect(seven.locator("svg")).toHaveCount(1);
    await seven.press("Enter");
    await expect(seven).toHaveAttribute("data-kb-state", "unlocked");
    await expect(seven).toHaveAttribute("aria-pressed", "true");
    await expect(seven.locator("svg")).toHaveCount(0);
    await expect.poll(settings).toContain('"numbers":true');

    // Same for punctuation: a mark unlock flips the punctuation add-on on.
    const comma = board.locator('[data-kb-key=","]');
    await expect(comma.locator("svg")).toHaveCount(1);
    await comma.click();
    await expect(comma.locator("svg")).toHaveCount(0);
    await expect.poll(settings).toContain('"punctuation":true');

    // With the add-on now on, clicking the unlocked key locks just that key
    // again (per-key selection), leaving the add-on untouched.
    await comma.click();
    await expect(comma.locator("svg")).toHaveCount(1);
    await expect.poll(settings).toContain('"punctuation":true');

    // Capitals: on the shift layer every capital reads locked while the add-on
    // is off; clicking one flips capitals on, and each capital then mirrors its
    // lowercase base key ('a' selected → A unlocked).
    await page.getByRole("button", { name: "Show shifted keys (capitals and symbols)" }).click();
    const capitalA = board.locator('[data-kb-key="A"]');
    await expect(capitalA.locator("svg")).toHaveCount(1);
    await capitalA.click();
    await expect(capitalA.locator("svg")).toHaveCount(0);
    await expect.poll(settings).toContain('"capitals":true');
  });

  // Regression guard: a diagnosis can surface all-consonant weak keys, and the
  // drill handoff used to hand Practice a vowel-less key set, which froze the
  // pseudo-word generator (an infinite loop) and hung the whole page. The drill
  // must stay responsive and render a usable test. The Playwright timeout turns a
  // re-introduced hang into a clean failure rather than a wedged run.
  test("drilling an all-consonant weakness stays responsive", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/?mode=practice&keys=b,c,d");

    await expect(page.locator(".typecafe-keyboard")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#words .char").nth(5)).toBeVisible({ timeout: 8000 });

    // The handoff selection (b,c,d + auto vowel) is then repaired to the letter
    // floor (two vowels, eight letters), which regenerates the text once more.
    // Wait for the repaired state - the count hits 8 and an "a" appears (the
    // b/c/d/e-only text can't contain one) - so typing can't race that regen.
    await expect(page.getByTestId("practice-active-count")).toHaveText("8 keys active");
    await expect(page.locator("#words")).toContainText("a", { timeout: 8000 });

    // Practice now routes the complete passage through the language engine. It
    // should prefer natural carriers while keeping every fallback word-shaped.
    const corpus = new Set(english1k.words);
    await expect.poll(async () => {
      const words = ((await page.locator("#words").textContent()) ?? "").trim().split(/\s+/).slice(0, 25);
      return words.length === 25
        && words.every((word) => word.length >= 3 && word.length <= 10)
        && words.some((word) => corpus.has(word));
    }).toBe(true);

    // The main thread is responsive and the drill is interactive (not frozen).
    for (let i = 0; i < 4; i++) await typeCurrentCharacter(page, i);
    await expect(page.getByTestId("stat-acc")).toHaveText("100", { timeout: 4000 });
  });

  // Phase 1.3 + Slice 5c: the loop's last mile - /drill's "Re-measure" CTA returns
  // home as /?rm=<token>, which rebuilds the offer, re-runs the diagnosed test on
  // its original config, and headlines a before→after delta. Proven for a guest.
  test("re-measure round-trip: drill then Re-measure shows a before/after delta (guest)", async ({ page }) => {
    await mockTrpc(page);

    // The token a diagnosis forwards: the diagnosed test's before-WPM + exact config
    // (a short ranked 4-word words test, customLength false → a fixed 4 words).
    const rm = encodeURIComponent(JSON.stringify({
      beforeWpm: 40,
      config: { subMode: 1, count: 4, language: "english", customLength: false, punctuation: false, capitals: false, options: "" },
    }));

    // Drill the diagnosed keys, then follow /drill's Re-measure CTA (a client-side
    // nav to /?rm=) - the real product path back into the diagnosed test.
    await page.goto(`/drill?keys=x&length=4&rm=${rm}`);
    await expect(page.getByTestId("drill-typer")).toBeVisible();
    await typeVisibleTestText(page);
    await page.getByRole("link", { name: "Re-measure" }).click();

    // Home rebuilds the offer, switches into the diagnosed config and starts it.
    // Wait for the rm config to actually apply (its 4-word counter replaces the
    // default timed countdown) before reading the prompt - typing against the
    // pre-switch text loses the race when the restart regenerates it.
    await expect(page.getByTestId("word-counter")).toContainText("/ 4");
    // …and for the 4-word prompt itself (the long default text stays rendered
    // until regeneration lands, so char presence alone isn't enough).
    await expect.poll(() => page.locator("#words .char").count()).toBeLessThan(60);
    await typeVisibleTestText(page);

    // The result headlines the before → after delta, then the offer is retired.
    await expect(page.getByTestId("re-measure-delta")).toBeVisible({ timeout: 15_000 });
  });

  test("guest practice aggregates import after sign in", async ({ page }) => {
    let importedStats: unknown[] = [];

    await mockTrpc(page, {
      onProcedure: (procedure, input) => {
        if (procedure === "practiceStats.batchSync" && Array.isArray(input?.stats)) {
          importedStats = input.stats;
        }
      },
    });
    await gotoHome(page);

    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    for (let i = 0; i < 6; i++) await typeCurrentCharacter(page, i);

    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:keyStats")),
    ).toContain('"attempts"');

    await mockAuthenticatedSession(page);
    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();

    await expect.poll(() => importedStats.length).toBeGreaterThan(0);
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:keyStats")),
    ).toBeNull();
  });

  test("saves a home screenshot artifact for agent inspection", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
  });
});
