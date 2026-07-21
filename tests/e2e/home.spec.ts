import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";
import { higherOrderTimeline, impactTimeline } from "./helpers/evidence";
import { TestModes, TestSubModes } from "../../src/components/typer/types";
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

function selectMode(page: Page, name: "Timed" | "Words", options?: { force?: boolean }) {
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
  test("a one-character word Test completes instead of stalling", async ({ page }) => {
    const aIndex = english1k.words.indexOf("a");
    await page.addInitScript(({ mode, subMode, randomValue }) => {
      window.localStorage.setItem("typecafe:testSettings", JSON.stringify({
        mode,
        subMode,
        language: "english",
        count: 1,
        customLength: true,
      }));
      Math.random = () => randomValue;
    }, {
      mode: TestModes.normal,
      subMode: TestSubModes.words,
      randomValue: (aIndex + 0.5) / english1k.words.length,
    });
    await gotoHome(page);

    await expect(page.locator("#words")).toHaveText("a");
    await page.locator("#input").focus();
    await page.keyboard.press("a");

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible();
  });

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

    await expect(page.getByTestId("mode-bar").getByRole("button")).toHaveText(["timed", "words"]);
  });

  test("language icon stays available across ordinary Test modes", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByTestId("typer-toolbar");
    const langButton = toolbar.getByRole("button", { name: /^Language:/ });

    // Timed (default), Words use a word list → icon shown; ∞ (no timer) keeps it.
    await expect(langButton).toBeVisible();
    await selectMode(page, "Words", { force: true });
    await expect(langButton).toBeVisible();
    await page.getByTestId("toolbar-context").getByRole("button", { name: "Infinite words" }).click();
    await expect(langButton).toBeVisible();

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

  test("legacy Home Practice and Grams links reach canonical Practice", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/?mode=grams");
    await expect(page).toHaveURL(/\/practice\?custom=grams/);
    await expect(page.getByRole("region", { name: "Gram editor" })).toBeVisible();

    await page.goto("/?mode=practice&keys=x");
    await expect(page).toHaveURL(/\/practice\?target=key.*keys=x/);
    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "guided");
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

  test("signed-in users get a coach tab that drills their slowest transition", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    if (testInfo.project.name.includes("mobile")) {
      const inlineTab = page.getByTestId("home-coach-tab-drill-inline");
      await expect(inlineTab).toBeVisible();
      await expect(inlineTab.getByText("Practice", { exact: true })).toBeVisible();
      await expect(inlineTab).toContainText("b->r");
      await expect(inlineTab.getByRole("link", { name: "Practice target" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);
      await inlineTab.getByRole("button", { name: "Dismiss drill suggestion" }).click();
      await expect(inlineTab).toBeHidden();
      return;
    }

    const tab = page.getByTestId("home-coach-tab-drill");
    await expect(tab).toBeVisible();
    const collapsedLink = tab.getByRole("link", { name: "Suggested target" });
    await expect(collapsedLink).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);
    const collapsedLabel = tab.getByRole("link", { name: "Suggested target" });
    await expect(collapsedLabel).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-drill-panel");
    await expect(collapsedLink).toHaveCSS("opacity", "0");
    await expect(panel).toContainText("b->r");
    await expect(panel).toContainText("2.2x avg");
    await expect(panel.getByRole("link", { name: "Practice target" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);

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
      await expect(inlineTab.getByRole("link", { name: "Practice target" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);
      return;
    }

    const tab = page.getByTestId("home-coach-tab-drill");
    await expect(tab).toBeVisible();
    await tab.hover();
    const panel = page.getByTestId("home-coach-tab-drill-panel");
    await expect(panel).toContainText("b->r");
    await expect(panel.getByRole("link", { name: "Practice target" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);
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

    // An explicit pick pins: QWERTY stays through a language change.
    await trigger.click();
    await page.getByTestId("nav-layout-menu").getByRole("button", { name: "QWERTY", exact: true }).click();
    await expect(trigger).toHaveText(/^QWERTY$/);
    await page.getByTestId("nav-language-trigger").click();
    await expect(page.getByTestId("nav-language-menu")).toBeVisible();
    const french = page.getByTestId("nav-language-menu").getByRole("button", { name: "French" });
    await expect(french).toBeVisible();
    await french.evaluate((button: HTMLButtonElement) => button.click());
    await expect(trigger).toHaveText(/^QWERTY$/);

    // The Auto entry keeps previewing what Auto *would* resolve to (French →
    // AZERTY), never the pinned QWERTY - a pin doesn't redefine what Auto means.
    await trigger.click();
    await expect(page.getByTestId("nav-layout-auto")).toHaveText(/Auto - AZERTY \(FR\)/);
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

  test("settings cover language, text add-ons, and no-timer length", async ({ page }) => {
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

  test("numbers are guaranteed in ordinary word Tests and remain visible on the result", async ({ page }) => {
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

  test("capitals recover country, state, and initialism casing in the typing surface", async ({ page }) => {
    // Keep the generated 5k prompt on four known corpus indexes so the browser
    // path proves canonical casing without depending on a lucky random draw.
    await page.addInitScript(() => {
      const values = [656, 558, 1016, 3589].map((index) => (index + 0.5) / 4971);
      let call = 0;
      Math.random = () => values[call++ % values.length]!;
    });
    await gotoHome(page);

    await page.getByTestId("typer-toolbar").getByRole("button", { name: /^Language: English/ }).click();
    await page.getByTestId("language-menu").getByRole("button", { name: "English 5k", exact: true }).click();
    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /capitals/ }).click();
    await page.keyboard.press("Escape");

    const prompt = page.locator("#words");
    await expect(prompt).toContainText("Australia");
    await expect(prompt).toContainText("Texas");
    await expect(prompt).toContainText("PDF");
    await expect(prompt).toContainText("NASA");
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

  test("Home suggests the same Impact-ranked Target used by Progress", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      // The aggregate fallback would choose rare io (2x slower). Timeline cost
      // chooses common br (1.4x slower), proving the new selector won.
      transitionStats: [
        { pair: "th", count: 100, totalMs: 10_000, errors: 0 },
        { pair: "br", count: 40, totalMs: 5_600, errors: 0 },
        { pair: "io", count: 8, totalMs: 1_600, errors: 0 },
      ],
      timelineEvidence: [impactTimeline(1), impactTimeline(2)],
    });
    await gotoHome(page);

    const tab = page.getByTestId(testInfo.project.name.includes("mobile")
      ? "home-coach-tab-drill-inline"
      : "home-coach-tab-drill");
    await expect(tab).toBeVisible();
    if (!testInfo.project.name.includes("mobile")) await tab.hover();
    await expect(tab).toContainText("b->r");
    await expect(tab).toContainText("per 1k chars");
    await expect(tab.getByRole("link", { name: "Practice target" })).toHaveAttribute("href", /\/practice\?target=transition.*transitions=br.*evidence=/);

    await page.goto("/progress");
    await expect(page.getByTestId("coach-targets")).toContainText("b→r");
  });

  test("registers the first keystroke after the typing input loses focus", async ({ page }) => {
    await gotoHome(page);

    // Returning from another browser tab can leave focus on the document body.
    // The first printable key must both restore typing focus and count as c0.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page.locator("#input")).not.toBeFocused();

    await typeCurrentCharacter(page);

    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/active-char/);
    await expect(page.getByTestId("stat-acc")).toHaveText("100");
  });

  test("does not replace an active prompt when keyboard detection resolves late", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "keyboard", {
        configurable: true,
        value: {
          getLayoutMap: () => new Promise<Map<string, string>>((resolve) => {
            window.setTimeout(() => resolve(new Map([
              ["KeyY", "z"],
              ["KeyZ", "y"],
              ["Backslash", "#"],
            ])), 750);
          }),
        },
      });
    });
    await gotoHome(page);

    await typeCurrentCharacter(page, 0);
    await typeCurrentCharacter(page, 1);
    await expect(page.locator("#c2")).toHaveClass(/active-char/);

    // The detection result is cached for the next mount/test boundary; it must
    // not switch language/layout and regenerate text underneath this attempt.
    await page.waitForTimeout(1_000);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c2")).toHaveClass(/active-char/);
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" })).toBeVisible();
  });

  test("a pending guest score saves without interrupting a test started before auth resolves", async ({ page }) => {
    const procedures: string[] = [];
    await page.route("**/api/auth/session", async (route) => {
      // Model the full-page return from OAuth: the typer is interactive while
      // NextAuth is still resolving the newly authenticated session.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "user-1",
            name: "Test User",
            email: "test@example.com",
            username: "testuser",
            image: null,
          },
          expires: "2099-01-01T00:00:00.000Z",
        }),
      });
    });
    await mockTrpc(page, {
      delayProcedures: {
        "test.create": 800,
      },
      onProcedure: (procedure) => procedures.push(procedure),
    });
    await page.addInitScript(() => {
      const typedText = "steady hands";
      window.sessionStorage.setItem("typecafe:pendingScore", JSON.stringify({
        savedAt: Date.now(),
        score: {
          speed: 60,
          rawWpm: 60,
          netWpm: 60,
          accuracy: 100,
          durationSeconds: 2,
          totalKeystrokes: typedText.length,
          correctKeystrokes: typedText.length,
          incorrectKeystrokes: 0,
          promptText: typedText,
          typedText,
          typedSegments: typedText.split("").map((ch) => ({ ch, correct: true })),
          worstKeys: [],
          timeline: [],
          wpmSamples: [{ elapsedSeconds: 0, wpm: 0 }, { elapsedSeconds: 2, wpm: 60 }],
          brag: null,
          layout: "qwerty",
          count: 2,
          mode: 0,
          subMode: 1,
          language: "english",
          ranked: false,
          createdAt: new Date().toISOString(),
        },
        createInput: {
          typeId: "type-normal",
          count: 2,
          options: "",
          punctuation: false,
          capitals: false,
          numbers: false,
          timeline: [],
        },
      }));
    });
    await page.goto("/");

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await typeCurrentCharacter(page);
    await typeCurrentCharacter(page);
    await expect(page.locator("#c2")).toHaveClass(/active-char/);

    // Import the guest score in the background, but leave the in-progress test
    // alone. In particular, importing is not an implicit request to share it.
    await expect.poll(() => procedures.filter((procedure) => procedure === "test.create").length).toBe(1);
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#c2")).toHaveClass(/active-char/);
    expect(procedures).not.toContain("scoreShare.create");
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("typecafe:pendingScore"))).toBeNull();
  });

  test("an unranked guest test does not enter Progress history", async ({ page }) => {
    await gotoHome(page);
    await setToolbarCustomLength(page, "3");
    await page.locator("#text").click();
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await typeCurrentCharacter(page);

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Unranked")).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      window.localStorage.getItem("typecafe:progressHistory"),
    )).toBeNull();
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
  // finding and a one-click drill that lands on the unified Practice surface
  // from those keys - the first two clicks of the improvement loop, available to a
  // guest with no account.
  test("diagnosis panel opens exact Guided Practice directly (guest)", async ({ page }) => {
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
    // verbatim via Guided Practice (checked by href so we don't navigate away yet).
    const wordsDrill = page.getByRole("link", { name: /Practise these words/ });
    await expect(wordsDrill).toBeVisible();
    await expect(wordsDrill).toHaveAttribute("href", /\/practice\?target=word.*evidence=/);

    const drillButton = page.getByRole("link", { name: /Practise these keys/ }).first();
    await expect(drillButton).toBeVisible();
    const drillLabel = await drillButton.getAttribute("aria-label");
    expect(drillLabel).toMatch(/^Practise these keys: /);
    const diagnosedKeys = drillLabel!.replace(/^Practise these keys: /, "").split(", ");
    const drillHref = await drillButton.getAttribute("href");
    expect(new URL(drillHref!, page.url()).searchParams.get("keys")).toBe(diagnosedKeys.join(","));
    await drillButton.click();

    await expect(page).toHaveURL(/\/practice\?target=key/);
    await expect(page).toHaveURL(/[?&]evidence=/);
    expect(new URL(page.url()).searchParams.get("keys")).toBe(diagnosedKeys.join(","));
    await expect(page.getByTestId("custom-practice-workspace")).toHaveAttribute("data-practice-kind", "guided");
    await expect(page.getByRole("heading", { name: `Practise ${diagnosedKeys.join(" ")}`, exact: true })).toBeVisible();
    await expect(page.getByTestId("guided-practice-intent")).toHaveCount(0);
  });

  for (const legacyMode of [1, 2]) {
    test(`sanitizes persisted legacy Home mode ${legacyMode} to a safe ordinary Test`, async ({ page }) => {
      await page.addInitScript((mode) => {
        window.localStorage.setItem("typecafe:testSettings", JSON.stringify({ mode, subMode: 99, count: -1, customLength: true }));
      }, legacyMode);
      await gotoHome(page);

      const modeBar = page.getByTestId("mode-bar");
      await expect(modeBar.getByRole("button")).toHaveText(["timed", "words"]);
      await expect(modeBar.getByRole("button", { name: "timed" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "15", exact: true })).toHaveAttribute("aria-pressed", "true");
    });
  }

  test("diagnosis excludes an inaccurate word fragment when a timed Test ends", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);
    await setToolbarCustomLength(page, "10");

    // Clear the diagnosis floor, then stop immediately after two inaccurate
    // letters in a fresh word. Before #144 this tail was displayed as though it
    // were a complete Weak Word.
    const active = page.locator("#words .active-char");
    const typeActiveCorrectly = async () => {
      const char = await active.textContent();
      expect(char).not.toBeNull();
      await page.keyboard.press(char === " " ? "Space" : char!);
    };
    for (let i = 0; i < 30; i++) await typeActiveCorrectly();
    for (let i = 0; i < 20 && await active.textContent() !== " "; i++) {
      await typeActiveCorrectly();
    }
    await expect(active).toHaveText(" ");
    await typeActiveCorrectly();

    let fragment = "";
    for (let i = 0; i < 2; i++) {
      const expected = await active.textContent();
      expect(expected).not.toBeNull();
      fragment += expected;
      await page.keyboard.press(expected === "a" ? "b" : "a");
    }

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    await expect(page.getByText(`Toughest words: ${fragment}.`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(`Practise these words: ${fragment}$`) })).toHaveCount(0);
  });

  test("diagnosis does not leak a history-only higher-order pattern into this score", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { timelineEvidence: [higherOrderTimeline(1), higherOrderTimeline(2)] });
    await gotoHome(page);
    await setToolbarCustomLength(page, "4");
    await typeWrongZeroes(page, 50);

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    const higherOrder = page.getByTestId("diagnosis-higher-order");
    await expect(higherOrder).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Practise the tion pattern" })).toHaveCount(0);
  });

  // Regression guard: Practice (and any non-Normal mode) carries a leftover
  // subMode of "timed". Without a Normal-mode gate that drives a decremental
  // countdown to 0 that fires the instant the test starts - rendering a stuck
  // "0" and ending the session immediately. Verify both: no countdown, and the
  // drill keeps running as keys are typed.
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
  test("saves a home screenshot artifact for agent inspection", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
  });
});
