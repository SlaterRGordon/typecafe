import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
  await expect(page.locator("#words .char").first()).toBeVisible();
}

// Mode switches inline on the main page; everything else lives in the modal.
function selectMode(page: Page, name: "Timed" | "Words" | "Practice" | "Grams" | "Relaxed" | "Quotes", options?: { force?: boolean }) {
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

  test("toolbar owns mode, length, language, and right-side actions", async ({ page }) => {
    await gotoHome(page);

    const modeBar = page.getByTestId("mode-bar");
    const toolbar = page.getByTestId("typer-toolbar");
    await expect(modeBar.getByRole("button", { name: "Timed" })).toHaveAttribute("aria-pressed", "true");
    await expect(modeBar.getByRole("button", { name: "Normal" })).toHaveCount(0);
    await expect(toolbar.getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true");

    // Words owns its length controls directly beside the mode group.
    await selectMode(page, "Words", { force: true });
    await expect(modeBar.getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await toolbar.getByRole("button", { name: "25" }).click();
    await expect(toolbar.getByRole("button", { name: "25" })).toHaveAttribute("aria-pressed", "true");

    const context = page.getByTestId("toolbar-context");
    const beforeCustomBox = await context.boundingBox();
    await context.getByRole("button", { name: "Custom" }).click();
    const customInput = page.locator("#customLengthInput");
    await expect(customInput).toBeVisible();
    const afterCustomBox = await context.boundingBox();
    expect(beforeCustomBox).not.toBeNull();
    expect(afterCustomBox).not.toBeNull();
    expect(afterCustomBox!.width).toBeCloseTo(beforeCustomBox!.width, 0);
    await customInput.fill("6000");
    // Enter commits (clamped to the max) and collapses the editor; the Custom
    // button stays selected because the length is non-preset.
    await customInput.press("Enter");
    await expect(customInput).toHaveValue("5000");
    await expect(page.getByTestId("custom-length-panel")).toHaveAttribute("aria-hidden", "true");
    await expect(context.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");

    // Language moved to its own toolbar icon.
    await toolbar.getByRole("button", { name: "Language: English" }).click();
    await expect(page.getByTestId("language-menu")).toBeVisible();
    await toolbar.getByRole("button", { name: "Spanish" }).click();
    await expect(toolbar.getByRole("button", { name: "Language: Spanish" })).toBeVisible();

    // Settings is now a compact toolbar dropdown for secondary toggles only.
    await openSettingsMenu(page);
    const settingsMenu = page.getByTestId("settings-menu");
    await expect(settingsMenu.getByText("Text")).toBeVisible();
    await expect(settingsMenu.getByText("Display")).toBeVisible();
    await expect(settingsMenu.getByText("Language")).toHaveCount(0);
    await expect(settingsMenu.getByText("Length")).toHaveCount(0);
    await expect(settingsMenu.getByText("Type")).toHaveCount(0);
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

    // Grams mode switches on the inline bar; its settings live in the subpanel
    // below the toolbar (not in the toolbar context, which collapses).
    await selectMode(page, "Grams");
    const gramsPanel = page.getByTestId("grams-panel");
    await expect(gramsPanel).toBeVisible();
    await expect(gramsPanel.getByRole("button", { name: "Bigrams" })).toHaveAttribute("aria-pressed", "true");
  });

  test("language icon shows only on word-list modes", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByTestId("typer-toolbar");
    const langButton = toolbar.getByRole("button", { name: /^Language:/ });

    // Timed (default), Words, Relaxed use a word list → icon shown.
    await expect(langButton).toBeVisible();
    await selectMode(page, "Words", { force: true });
    await expect(langButton).toBeVisible();
    await selectMode(page, "Relaxed");
    await expect(langButton).toBeVisible();

    // Grams + Practice generate from n-grams / selected keys → icon hidden.
    await selectMode(page, "Grams");
    await expect(langButton).toHaveCount(0);
    await selectMode(page, "Practice");
    await expect(langButton).toHaveCount(0);
    // Quotes carry their own text → language icon hidden.
    await selectMode(page, "Quotes");
    await expect(langButton).toHaveCount(0);
  });

  test("Quotes mode swaps the length presets for length buckets and types verbatim", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Quotes");
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Quotes" })).toHaveAttribute("aria-pressed", "true");

    // The length buckets replace the timed/word presets.
    const bucketBar = page.getByTestId("quote-length-bar");
    await expect(bucketBar.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await bucketBar.getByRole("button", { name: "Short" }).click();
    await expect(bucketBar.getByRole("button", { name: "Short" })).toHaveAttribute("aria-pressed", "true");

    // A quote loads as real prose — capitals and punctuation survive (the typer
    // lowercases word-list text, so an uppercase char proves it's a verbatim quote).
    await expect(page.locator("#words")).toContainText(/[A-Z]/);
  });

  test("English exposes vocabulary sizes that load on demand", async ({ page }) => {
    await gotoHome(page);
    const toolbar = page.getByTestId("typer-toolbar");

    // Default English is the curated 10k slice.
    await toolbar.getByRole("button", { name: "Language: English 10k" }).click();
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

  test("settings cover language, practice, relaxed, stats, and keyboard options", async ({ page }) => {
    await gotoHome(page);

    await page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" }).click();
    await page.getByTestId("typer-toolbar").getByRole("button", { name: "Spanish" }).click();
    await expect(page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: Spanish" })).toBeVisible();

    await openSettingsMenu(page);

    const settingsMenu = page.getByTestId("settings-menu");
    await settingsMenu.getByRole("button", { name: /Live stats/ }).click();
    await expect(page.getByText("0.0wpm")).toBeHidden();

    await settingsMenu.getByRole("button", { name: /Keyboard/ }).click();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settingsMenu).toBeHidden();

    // Mode switches on the inline bar, no modal round-trip.
    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    await selectMode(page, "Relaxed");
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Relaxed" })).toHaveAttribute("aria-pressed", "true");
  });

  test("keyboard toggle keeps the typing text vertically stable", async ({ page }) => {
    await gotoHome(page);

    const beforeBox = await page.locator("#words").boundingBox();
    expect(beforeBox).not.toBeNull();

    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /Keyboard/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    const afterBox = await page.locator("#words").boundingBox();
    expect(afterBox).not.toBeNull();
    expect(Math.abs(afterBox!.y - beforeBox!.y)).toBeLessThanOrEqual(8);
  });

  // Phase 2 regression: the toolbar moved inside #typer, where Text.tsx's
  // click/keydown handlers used to yank focus back to the hidden typing input —
  // making the custom-length field uneditable (only the first digit ever landed).
  test("custom length input stays focused and editable while typing", async ({ page }) => {
    await gotoHome(page);

    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    const input = page.locator("#customLengthInput");
    await expect(input).toBeVisible();

    await input.click();
    await expect(input).toBeFocused();

    // Real, per-keystroke typing (not fill) — this is what the focus-steal broke:
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

    // Both responsive copies of the stats render the same value; assert it is
    // present rather than coupling to which copy is visible at this viewport.
    await expect(page.getByText("75.00%").first()).toBeAttached();
  });

  test("an incorrect first keystroke counts against accuracy", async ({ page }) => {
    await gotoHome(page);

    await typeWrongCharacter(page, 0);

    // 0-of-1 correct = 0.00%; previously the first wrong key didn't register at all.
    await expect(page.getByText("0.00%").first()).toBeAttached();
  });

  // Regression guard for the grams micro-sample WPM (phase-0-trust.md 0.1): the
  // default 2-char gram level used to read "500.0 wpm (500.0avg)". A sample that
  // small can't be measured, so WPM and its average must show "—" instead.
  test("grams mode shows — instead of an inflated WPM on a micro-sample level", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Grams");

    await expect(page.locator("#words .char").first()).toBeVisible();
    await typeVisibleTestText(page);

    // The WPM and its running average render "—", never an inflated number like 500.
    await expect(page.getByTestId("stat-wpm")).toHaveText("—");
    await expect(page.getByTestId("stat-avg")).toHaveText("—");
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

    await typeCurrentCharacter(page);

    // The toast (auto-dismisses after 5s) is the time-sensitive assertion; check it
    // first, then the results card that should render despite the failed save.
    await expect(page.getByText("Couldn't save your score", { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible();
  });

  // Phase 1.2/1.3 + Slice 5c: a finished test must surface at least one honest
  // finding and a one-click drill that lands on the unified /drill surface built
  // from those keys — the first two clicks of the improvement loop, available to a
  // guest with no account.
  test("diagnosis panel offers a one-click drill on /drill (guest)", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);

    // A short custom timed test, long enough to clear the 30-keystroke floor.
    await setToolbarCustomLength(page, "4");

    // 50 deliberately-wrong keystrokes: every expected key is missed, so several
    // keys land under 100% — enough for an honest "least accurate keys" finding
    // regardless of the (machine-uniform) keystroke timing.
    await typeWrongZeroes(page, 50);

    // Timer expiry renders the results card with the diagnosis panel.
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    await expect(page.getByText("Too short to diagnose")).toHaveCount(0);
    // Phase 1.5: the reusable per-key heatmap renders inside the diagnosis panel.
    await expect(page.getByTestId("diagnosis-heatmap")).toBeVisible();

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
  // countdown to 0 that fires the instant the test starts — rendering a stuck
  // "0" and ending the session immediately. Verify both: no countdown, and the
  // drill keeps running as keys are typed.
  test("practice mode has no countdown and keeps running", async ({ page }) => {
    await gotoHome(page);

    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // The large countdown number (text-4xl font-mono) must not be present.
    await expect(page.locator("#typer .text-4xl.font-mono")).toHaveCount(0);

    // Typing accrues live stats — proof the session is running, not instantly
    // completed (which would leave the stats pending at "—" forever).
    // Both responsive stats copies render the same value; assert it is present
    // rather than coupling to which copy is visible at this viewport.
    for (let i = 0; i < 6; i++) await typeCurrentCharacter(page, i);
    await expect(page.getByText("100.00%").first()).toBeAttached({ timeout: 3000 });
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

    // The main thread is responsive and the drill is interactive (not frozen).
    for (let i = 0; i < 4; i++) await typeCurrentCharacter(page, i);
    await expect(page.getByText("100.00%").first()).toBeAttached({ timeout: 4000 });
  });

  // Phase 1.3 + Slice 5c: the loop's last mile — /drill's "Re-measure" CTA returns
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
    // nav to /?rm=) — the real product path back into the diagnosed test.
    await page.goto(`/drill?keys=x&length=4&rm=${rm}`);
    await expect(page.getByTestId("drill-typer")).toBeVisible();
    await typeVisibleTestText(page);
    await page.getByRole("link", { name: "Re-measure" }).click();

    // Home rebuilds the offer, switches into the diagnosed config and starts it.
    await expect(page.locator("#words .char").first()).toBeVisible();
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
