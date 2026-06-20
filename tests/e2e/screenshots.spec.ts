import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { chooseReactSelectOption } from "./helpers/select";
import { typeCurrentCharacter } from "./helpers/typing";
import { join } from "node:path";

// Captures every page and menu state into docs/screenshots/<project>/ so the
// UI can be reviewed from artifacts alone. Each test is independent so a
// single broken state never blocks the rest of the captures.
const screenshotRoot = join(__dirname, "../../docs/screenshots");

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // Modals and the score card fade in; without settling, captures land
  // mid-animation with semi-transparent overlays.
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(screenshotRoot, testInfo.project.name, `${name}.png`),
    fullPage: true,
  });
}

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();
}

async function openSettingsMenu(page: Page) {
  await page.getByTestId("typer-toolbar").getByRole("button", { name: "Open typing settings" }).click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
}

// Mode switches on the inline mode bar (the modal holds everything else).
function selectMode(page: Page, name: "Timed" | "Words" | "Practice" | "Grams" | "Relaxed") {
  return page.getByTestId("mode-bar").getByRole("button", { name }).click();
}

async function setToolbarCustomLength(page: Page, value: string) {
  await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
  const input = page.locator("#customLengthInput");
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.press("Enter");
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

async function startTimedChallenge(page: Page) {
  await page.locator("#text").click();
  const firstChar = await page.locator("#words .active-char").last().textContent();
  if (firstChar === " ") await page.keyboard.press("Space");
  else await page.keyboard.press(firstChar ?? "a");
}

async function finishVisibleTypingTest(page: Page) {
  await page.locator("#text").click();

  for (let index = 0; index < 120; index += 1) {
    const active = await page.evaluate(() => {
      if (document.querySelector('[data-testid="score-screenshot-card"]')) return "complete";
      if (document.querySelector('[data-testid="beat-run-comparison"]')) return "complete";

      const words = document.querySelector("#words");
      if (!words) return null;

      const activeChars = Array.from(words.querySelectorAll(".active-char"));
      const current = activeChars.at(-1);
      return current ? { id: current.id, char: current.textContent } : null;
    });
    if (active === "complete") return;
    if (!active || active.char === null) return;

    await page.locator("#text").click();
    if (active.char === " ") await page.keyboard.press("Space");
    else await page.keyboard.press(active.char);

    await page.waitForFunction((previousId) => {
      if (document.querySelector('[data-testid="score-screenshot-card"]')) return true;
      if (document.querySelector('[data-testid="beat-run-comparison"]')) return true;
      const activeChars = Array.from(document.querySelectorAll("#words .active-char"));
      return activeChars.at(-1)?.id !== previousId;
    }, active.id, { timeout: 2000 });
  }
}

test.describe("screenshot tour", () => {
  test("home: default and mid-test states", async ({ page }, testInfo) => {
    await gotoHome(page);
    await capture(page, testInfo, "01-home-default");

    // Type a few characters, including one mistake, to show progress and
    // error styling.
    await typeCurrentCharacter(page);
    await typeCurrentCharacter(page);
    await page.locator("#text").click();
    await page.keyboard.press("0");
    await capture(page, testInfo, "02-home-mid-test-with-error");
  });

  test("home: toolbar menus and mode contexts", async ({ page }, testInfo) => {
    await gotoHome(page);

    // Timed: the toolbar owns mode, length, language, and action icons.
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true");
    await openSettingsMenu(page);
    await capture(page, testInfo, "03-settings-timed");

    await page.keyboard.press("Escape");
    await page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" }).click();
    await expect(page.getByTestId("language-menu")).toBeVisible();
    await capture(page, testInfo, "39-language-dropdown");
    await page.keyboard.press("Escape");

    // Words is top-level and swaps the context controls beside the mode group.
    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "25" }).click();
    await capture(page, testInfo, "04-settings-words");

    await selectMode(page, "Timed");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    await expect(page.locator("#customLengthInput")).toBeVisible();
    await capture(page, testInfo, "06-settings-timed-custom-length");

    // Grams: switched on the inline bar; its settings live in the subpanel
    // anchored below the toolbar.
    await selectMode(page, "Grams");
    await expect(page.getByTestId("grams-panel")).toBeVisible();
    await capture(page, testInfo, "05-settings-grams");

    // Practice (keyboard) and Relaxed switch inline with no modal round-trip.
    await selectMode(page, "Practice");
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await capture(page, testInfo, "07-settings-practice-mode");

    await selectMode(page, "Relaxed");
    await openSettingsMenu(page);
    await expect(page.getByTestId("settings-menu")).toBeVisible();
    await capture(page, testInfo, "08-settings-relaxed-mode");
  });

  test("words mode: test view after closing modal", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true }).click();

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "23-test-view-words-mode");
  });

  test("timed mode: punctuation and capitals test view", async ({ page }, testInfo) => {
    await gotoHome(page);
    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /punctuation/ }).click();
    await page.getByTestId("settings-menu").getByRole("button", { name: /capitals/ }).click();
    await page.keyboard.press("Escape");

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "24-test-view-punctuation-capitals");
  });

  test("grams mode: test view with level progression stats", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectMode(page, "Grams");

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "25-test-view-grams-level");

    // Type the first characters so the per-level average and accuracy render.
    await typeCurrentCharacter(page, 0);
    await typeCurrentCharacter(page, 1);
    await capture(page, testInfo, "26-test-view-grams-mid-level");
  });

  test("relaxed mode: test view", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectMode(page, "Relaxed");

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "27-test-view-relaxed-mode");
  });

  test("fullscreen test view", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.locator("[aria-label='Enter fullscreen']").click();
    await expect(page.locator("[aria-label='Exit fullscreen']")).toBeVisible();
    await capture(page, testInfo, "28-test-view-fullscreen");
  });

  test("practice mode: keyboard key selection, alerts, and analytics view", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectMode(page, "Practice");

    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await capture(page, testInfo, "09-home-practice-keyboard");

    const keyboardKey = (key: string) =>
      page.locator(".typecafe-keyboard kbd", { hasText: new RegExp(`^${key}$`) });

    // Unlock an extra key: "e" starts locked outside the default home-row set.
    await keyboardKey("e").click();
    await expect(keyboardKey("e").locator("svg")).toHaveCount(0);
    await capture(page, testInfo, "29-practice-key-added");

    // Deselecting the only vowel must be rejected with an alert toast.
    await keyboardKey("e").click();
    await keyboardKey("a").click();
    await expect(page.getByText("Must include at least 1 vowel!")).toBeVisible();
    await capture(page, testInfo, "30-practice-vowel-alert");

    // Smart drill without enough typing history surfaces the warning toast.
    await page.getByRole("button", { name: "Drill your six least accurate keys" }).click();
    await expect(page.getByText("Not enough typing data yet — practice a little first!")).toBeVisible();
    await capture(page, testInfo, "31-practice-smart-drill-no-data");

    // Type a few characters so the analytics view has real session data.
    await page.locator("#text").click();
    await typeCurrentCharacter(page, 0);
    await typeCurrentCharacter(page, 1);
    await page.keyboard.press("0");
    await typeCurrentCharacter(page, 2);

    // The analytics view shows per-key accuracy as a heatmap.
    await page.locator("[aria-label='Show keyboard accuracy stats']").click();
    await expect(page.locator("[aria-label='Hide keyboard accuracy stats']")).toBeVisible();
    await capture(page, testInfo, "32-practice-keyboard-analytics");
  });

  test("learn page: difficulty and level selection", async ({ page }, testInfo) => {
    await page.goto("/learn");
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });

    await chooseReactSelectOption(page, "difficultySelect", "Hard");
    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "33-learn-hard-difficulty");

    // Open the level dropdown to show locked levels.
    await page.locator("#react-select-levelSelect-input")
      .locator("xpath=ancestor::*[contains(@class, 'my-react-select__control')][1]")
      .click();
    await expect(page.getByRole("option", { name: "Level 2", exact: true })).toBeVisible();
    await capture(page, testInfo, "34-learn-level-dropdown");
  });

  test("home: keyboard enabled and live stats disabled", async ({ page }, testInfo) => {
    await gotoHome(page);
    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /Keyboard/ }).click();
    await page.getByTestId("settings-menu").getByRole("button", { name: /Live stats/ }).click();
    await page.keyboard.press("Escape");

    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await expect(page.getByText("0.0wpm")).toBeHidden();
    await capture(page, testInfo, "10-home-keyboard-no-stats");
  });

  test("home: color settings modal", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open color settings']").click({ force: true });
    await expect(page.locator("#colorModal")).toBeChecked();
    await capture(page, testInfo, "11-color-settings-modal");
  });

  test("home: sign-in modal", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open sign in']").click({ force: true });
    await expect(page.locator("#signInModal")).toBeChecked();
    await capture(page, testInfo, "12-sign-in-modal");
  });

  test("home: completed test score card", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);

    // Shorten the test to 3 seconds so the completion dashboard appears fast.
    await setToolbarCustomLength(page, "3");

    await typeCurrentCharacter(page);
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    // Delta-first sharing (§3.3): the card shows WPM vs the 30-day average.
    await expect(page.getByTestId("avg-delta")).toContainText("over your 30-day average");
    // Streak chip on the result card (§3.2).
    await expect(page.getByTestId("score-streak")).toContainText("day streak");
    await capture(page, testInfo, "13-score-card-after-test");
  });

  test("home: post-test diagnosis panel and drill handoff", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await gotoHome(page);

    // A short custom timed test, long enough to clear the 30-keystroke diagnosis
    // floor; 50 wrong keystrokes guarantee an honest "least accurate keys" finding.
    await setToolbarCustomLength(page, "4");

    await typeWrongZeroes(page, 50);

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    // The mini per-key heatmap renders alongside the findings (Phase 1.5).
    await expect(page.getByTestId("diagnosis-heatmap")).toBeVisible();
    // 50 errors in a row → the error-taxonomy finding names the pattern (§4.2).
    await expect(page.getByTestId("taxonomy-finding")).toBeVisible();
    await capture(page, testInfo, "35-score-card-diagnosis");

    // The one-click drill hands off into Practice with the diagnosed keys selected.
    await page.getByRole("link", { name: /Drill these keys/ }).first().click();
    await expect(page.locator(".typecafe-keyboard")).toBeVisible();
    await capture(page, testInfo, "36-drill-handoff-practice");
  });

  test("home: re-measure prompt and before/after delta", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await gotoHome(page);

    await setToolbarCustomLength(page, "4");

    await typeWrongZeroes(page, 50);
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });

    // Hand off into Practice, where the re-measure prompt invites a re-run.
    await page.getByRole("link", { name: /Drill these keys/ }).first().click();
    await expect(page.getByTestId("re-measure-prompt")).toBeVisible();
    await capture(page, testInfo, "37-re-measure-prompt");

    // Re-run the diagnosed test → the result shows the before→after delta.
    await page.getByRole("button", { name: "Re-run your test" }).click();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await typeWrongZeroes(page, 50);
    await expect(page.getByTestId("re-measure-delta")).toBeVisible({ timeout: 15_000 });
    await capture(page, testInfo, "38-re-measure-delta");
  });

  test("learn page", async ({ page }, testInfo) => {
    await page.goto("/learn");
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
    await capture(page, testInfo, "14-learn-default");
  });

  test("leaderboard page", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/leaderboard");
    await expect(page.getByText("testuser").first()).toBeVisible();
    await capture(page, testInfo, "15-leaderboard");
  });

  test("profile page (authenticated)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.goto("/profile");
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByTestId("profile-streak")).toContainText("day streak");
    await capture(page, testInfo, "16-profile-own");
  });

  test("public profile page", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/profile/testuser");
    await expect(page.getByText("testuser").first()).toBeVisible();
    await capture(page, testInfo, "17-profile-public");
  });

  test("progress dashboard (authenticated, rich history)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [
      { character: "a", total: 200, correct: 198 },
      { character: "e", total: 320, correct: 305 },
      { character: "r", total: 120, correct: 96 },
      { character: "t", total: 160, correct: 150 },
      { character: "b", total: 60, correct: 42 },
    ] });
    // Suppress the weekly recap so this captures the steady-state dashboard.
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await page.goto("/progress");
    await expect(page.getByTestId("headline-delta")).toBeVisible();
    await expect(page.getByTestId("self-league-card")).toBeVisible();
    await expect(page.getByTestId("progress-filters")).toBeVisible();
    await expect(page.getByTestId("stance")).toBeVisible();
    await expect(page.getByTestId("worst-transitions")).toContainText("b→r");
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
    await capture(page, testInfo, "40-progress-dashboard");
  });

  test("progress dashboard (self league)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await page.goto("/progress");
    await expect(page.getByTestId("self-league-card")).toBeVisible();
    await expect(page.getByTestId("self-league-delta")).toContainText(/\+\d/);
    await capture(page, testInfo, "53-self-league");
  });

  test("progress dashboard (plateau coach voice)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { flatProgress: true });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await page.goto("/progress");
    await expect(page.getByTestId("plateau-headline")).toBeVisible();
    await capture(page, testInfo, "47-progress-plateau");
  });

  test("progress dashboard (goal trajectory)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now()));
      window.localStorage.setItem("typecafe:goal", JSON.stringify({ targetWpm: 100, targetDate: "2027-12-31" }));
    });
    await page.goto("/progress");
    await expect(page.getByTestId("goal-status")).toBeVisible();
    await capture(page, testInfo, "46-progress-goal");
  });

  test("progress dashboard (weekly recap)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "b", total: 60, correct: 40 }, { character: "e", total: 300, correct: 295 }] });
    // Last recap was over a week ago → the recap state opens.
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now() - 8 * 24 * 60 * 60 * 1000)));
    await page.goto("/progress");
    await expect(page.getByTestId("weekly-recap")).toBeVisible();
    await capture(page, testInfo, "45-progress-weekly-recap");
  });

  test("progress dashboard (empty history)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { emptyScores: true });
    await page.goto("/progress");
    await expect(page.getByText("No tests yet")).toBeVisible();
    await capture(page, testInfo, "41-progress-empty");
  });

  test("progress dashboard (signed-out pitch)", async ({ page }, testInfo) => {
    await page.goto("/progress");
    await expect(page.getByTestId("progress-signed-out")).toBeVisible();
    await capture(page, testInfo, "42-progress-signed-out");
  });

  test("progress dashboard (guest local history)", async ({ page }, testInfo) => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await page.addInitScript(({ now, day }) => {
      const entries = Array.from({ length: 12 }, (_, i) => ({ wpm: 55 + i * 1.5, accuracy: 95, t: now - (28 - i * 2.5) * day }));
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify(entries));
    }, { now, day });
    await page.goto("/progress");
    await expect(page.getByTestId("guest-keep-banner")).toBeVisible();
    await capture(page, testInfo, "43-progress-guest-history");
  });

  test("daily challenge", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/challenge");
    await expect(page.getByTestId("challenge-header")).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "49-daily-challenge");
  });

  test("daily challenge result share card", async ({ page }, testInfo) => {
    test.slow();
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.goto("/challenge");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await startTimedChallenge(page);

    await expect(page.getByTestId("score-screenshot-card")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("score-screenshot-card").getByText("+3.2 over my average")).toBeVisible();
    await capture(page, testInfo, "51-daily-challenge-result-share");
  });

  test("home: daily challenge prompt", async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-06-16T12:00:00.000Z") });
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:challengeHistory", JSON.stringify([
        { dateKey: "2026-06-15", wpm: 70.1, accuracy: 97, t: Date.parse("2026-06-15T12:00:00.000Z") },
        { dateKey: "2026-06-16", wpm: 74.2, accuracy: 98, t: Date.parse("2026-06-16T12:00:00.000Z") },
      ]));
    });
    await page.goto("/");
    await expect(page.getByTestId("daily-challenge-prompt")).toBeVisible();
    await capture(page, testInfo, "50-home-daily-challenge-prompt");
  });

  test("practice plan (targeted)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 100, correct: 70 }, { character: "t", total: 80, correct: 62 }] });
    await page.goto("/plan");
    await expect(page.getByTestId("plan-today")).toBeVisible();
    await capture(page, testInfo, "48-practice-plan");
  });

  test("practice plan (calibration)", async ({ page }, testInfo) => {
    await page.goto("/plan");
    await expect(page.getByText(/Calibration week/)).toBeVisible();
    await expect(page.getByTestId("plan-today")).toBeVisible();
    await capture(page, testInfo, "54-practice-plan-calibration");
  });

  test("shared progress card", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/score/progress-test-share");
    await expect(page.getByTestId("progress-share-card")).toBeVisible();
    await capture(page, testInfo, "44-shared-progress-card");
  });

  test("shared score page", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/score/share-test-score");
    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    // The persisted delta line rides the shared snapshot (§3.3 slice 2).
    await expect(page.getByTestId("avg-delta")).toContainText("over your 30-day average");
    await capture(page, testInfo, "18-shared-score");
  });

  test("beat-my-run compare view", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/score/beat-source-score?type=1");
    await expect(page.getByTestId("beat-run-header")).toBeVisible();

    await finishVisibleTypingTest(page);

    await expect(page.getByTestId("beat-run-comparison")).toBeVisible();
    await capture(page, testInfo, "52-beat-my-run-compare");
  });

  test("static pages", async ({ page }, testInfo) => {
    await page.goto("/contact");
    await expect(page.getByRole("heading", { name: "Contact TypeCafe" })).toBeVisible();
    await capture(page, testInfo, "19-contact");

    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await capture(page, testInfo, "20-support");

    await page.goto("/how-we-measure");
    await expect(page.getByRole("heading", { name: "How TypeCafe Measures Typing" })).toBeVisible();
    await capture(page, testInfo, "55-how-we-measure");

    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();
    await capture(page, testInfo, "21-privacy-policy");

    await page.goto("/terms-and-conditions");
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();
    await capture(page, testInfo, "22-terms-and-conditions");
  });
});
