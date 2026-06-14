import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { chooseReactSelectOption } from "./helpers/select";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#typer")).toBeVisible();
  await expect(page.locator("#words .char").first()).toBeVisible();
}

// Mode switches inline on the main page; everything else lives in the modal.
function selectMode(page: Page, name: "Normal" | "Practice" | "Grams" | "Relaxed") {
  return page.getByTestId("mode-bar").getByRole("button", { name }).click();
}

// The config modal overlay intercepts normal clicks, so close it via the checkbox.
async function closeConfigModal(page: Page) {
  await page.locator("#configModal").evaluate((input) => {
    const checkbox = input as HTMLInputElement;
    if (checkbox.checked) checkbox.click();
  });
  await expect(page.locator("#configModal")).not.toBeChecked();
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

    await page.locator("button", { has: page.locator("#restart") }).click();

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });

  test("mode switches inline; submode and grams settings live in the modal", async ({ page }) => {
    await gotoHome(page);

    // Normal/Timed: submode + length switch inside the modal.
    await page.locator("#typer label[for='configModal']").click();
    await expect(page.locator("#configModal")).toBeChecked();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Words" }).click();
    await expect(page.getByRole("heading", { name: "Length" })).toBeVisible();
    await page.getByRole("button", { name: "25" }).click();
    await closeConfigModal(page);

    // Grams mode switches on the inline bar; its settings appear in the modal.
    await selectMode(page, "Grams");
    await page.locator("#typer label[for='configModal']").click();
    await expect(page.getByRole("heading", { name: "Source" })).toBeVisible();
    await expect(page.locator("#testGramCombinationInput")).toHaveValue("1");

    await page.locator("#testGramAccuracyThresholdInput").fill("105");
    await expect(page.locator("#testGramAccuracyThresholdInput")).toHaveValue("100");
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
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Words" }).click();
    // Wait for the words-length options to confirm the mode switch settled.
    await expect(page.getByRole("button", { name: "100", exact: true })).toBeVisible();

    expect(scoreCreates).toBe(0);

    await page.getByRole("button", { name: "Timed" }).click();
    await expect(page.getByRole("button", { name: "120s", exact: true })).toBeVisible();

    expect(scoreCreates).toBe(0);
  });

  test("settings cover language, practice, relaxed, stats, and keyboard options", async ({ page }) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open typing settings']").click();

    await chooseReactSelectOption(page, "languageSelect", "Spanish");
    await expect(page.getByText("Spanish", { exact: true })).toBeVisible();

    // Scope each toggle to its own settings row so reordering rows can't break it.
    const settingRow = (heading: string) => page.locator("div")
      .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
      .filter({ has: page.getByRole("button", { name: "off" }) })
      .last();

    await settingRow("Live stats").getByRole("button", { name: "off" }).click();
    await expect(page.getByText("0.0wpm")).toBeHidden();

    await settingRow("Keyboard").getByRole("button", { name: "on" }).click();
    await closeConfigModal(page);
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    // Mode switches on the inline bar, no modal round-trip.
    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();

    await selectMode(page, "Relaxed");
    await expect(page.getByTestId("mode-bar").getByRole("button", { name: "Relaxed" })).toHaveAttribute("aria-pressed", "true");
  });

  test("test settings persist across a reload", async ({ page }) => {
    await gotoHome(page);

    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Words" }).click();
    await page.getByRole("button", { name: "25", exact: true }).click();
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:testSettings")),
    ).toContain('"count":25');

    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();

    await page.locator("#typer label[for='configModal']").click();
    await expect(page.getByRole("button", { name: "Words" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "25", exact: true })).toHaveClass(/bg-primary/);
  });

  test("timed test completes when the timer expires", async ({ page }) => {
    await gotoHome(page);

    // Shorten the test to 3 seconds via a custom timed length.
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#customLengthInput").fill("3");
    await page.locator("#configModal").evaluate((input) => {
      const checkbox = input as HTMLInputElement;
      if (checkbox.checked) checkbox.click();
    });
    await expect(page.locator("#configModal")).not.toBeChecked();

    // Start the test; the countdown should expire and show the score card even
    // though the text is nowhere near finished.
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

    // The average renders "(—avg)", never "(500.0avg)".
    await expect(page.getByText("(—avg)").first()).toBeAttached();
    await expect(page.getByText(/\d+\.\davg/)).toHaveCount(0);
  });

  // Regression guard for the swallowed-save bug (phase-0-trust.md 0.1): a signed-in
  // user whose score save fails used to get a blank screen. The results must still
  // render (unpersisted) and a toast must explain the failure.
  test("a failed score save still shows results, with a toast", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { errorProcedures: ["test.create"] });
    await gotoHome(page);

    // Shorten to a 3s timed test so the timer expiry triggers the (failing) save.
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#customLengthInput").fill("3");
    await page.locator("#configModal").evaluate((input) => {
      const checkbox = input as HTMLInputElement;
      if (checkbox.checked) checkbox.click();
    });
    await expect(page.locator("#configModal")).not.toBeChecked();

    await typeCurrentCharacter(page);

    // The toast (auto-dismisses after 5s) is the time-sensitive assertion; check it
    // first, then the results card that should render despite the failed save.
    await expect(page.getByText("Couldn't save your score", { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible();
  });

  // Phase 1.2/1.3: a finished test must surface at least one honest finding and a
  // one-click drill into Practice with those keys pre-selected — the first two
  // clicks of the improvement loop, available to a guest with no account.
  test("diagnosis panel offers a one-click drill into practice (guest)", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);

    // A short custom timed test, long enough to clear the 30-keystroke floor.
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#customLengthInput").fill("4");
    await page.locator("#configModal").evaluate((input) => {
      const checkbox = input as HTMLInputElement;
      if (checkbox.checked) checkbox.click();
    });
    await expect(page.locator("#configModal")).not.toBeChecked();

    // 50 deliberately-wrong keystrokes: every expected key is missed, so several
    // keys land under 100% — enough for an honest "least accurate keys" finding
    // regardless of the (machine-uniform) keystroke timing.
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("0");
    }

    // Timer expiry renders the results card with the diagnosis panel.
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    await expect(page.getByText("Too short to diagnose")).toHaveCount(0);

    const drillButton = page.getByRole("link", { name: /Drill these keys/ }).first();
    await expect(drillButton).toBeVisible();
    await drillButton.click();

    // Handoff lands in Practice mode (its keyboard always renders) with the
    // results card dismissed — the drill is ready on the diagnosed keys.
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Test Again" })).toBeHidden();
    await expect.poll(async () =>
      page.evaluate(() => window.localStorage.getItem("typecafe:testSettings")),
    ).toContain('"mode":1');
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

  // Phase 1.3: the loop's last mile — after drilling, re-run the diagnosed test
  // and see a before→after delta. Proven end-to-end for a guest, no account.
  test("re-measure loop shows a before to after delta (guest)", async ({ page }) => {
    await mockTrpc(page);
    await gotoHome(page);

    // 1. A short custom timed test that clears the diagnosis floor.
    await page.locator("#typer label[for='configModal']").click();
    await page.getByRole("button", { name: "Custom" }).click();
    await page.locator("#customLengthInput").fill("4");
    await page.locator("#configModal").evaluate((input) => {
      const checkbox = input as HTMLInputElement;
      if (checkbox.checked) checkbox.click();
    });
    await expect(page.locator("#configModal")).not.toBeChecked();

    for (let i = 0; i < 50; i++) await page.keyboard.press("0");
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });

    // 2. Drill handoff lands in Practice with the re-measure prompt.
    await page.getByRole("link", { name: /Drill these keys/ }).first().click();
    await expect(page.getByTestId("re-measure-prompt")).toBeVisible();

    // 3. Re-run the diagnosed test on its original config.
    await page.getByRole("button", { name: "Re-run your test" }).click();
    await expect(page.locator("#words .char").first()).toBeVisible();
    for (let i = 0; i < 50; i++) await page.keyboard.press("0");

    // 4. The result headlines the before → after delta, then the offer is retired.
    await expect(page.getByTestId("re-measure-delta")).toBeVisible({ timeout: 15_000 });
  });

  test("saves a home screenshot artifact for agent inspection", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
  });
});
