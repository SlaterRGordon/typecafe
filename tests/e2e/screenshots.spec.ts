import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { brDrillTimeline, crowdedAccuracyTimeline, higherOrderTimeline, impactTimeline } from "./helpers/evidence";
import { typeCurrentCharacter, typeVisibleTestText, typeWrongCharacter } from "./helpers/typing";
import { completedKeyAccuracySession, progressCoachingHistory } from "./helpers/coachingFixtures";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { runStartFile } from "./globalSetup";

// Captures every page and menu state into docs/screenshots/<project>/ so the
// UI can be reviewed from artifacts alone. Each test is independent so a
// single broken state never blocks the rest of the captures.
const screenshotRoot = join(__dirname, "../../docs/screenshots");

// Prune captures left behind by renamed/removed tests: anything older than
// this run's start (stamped once in globalSetup) can't have been written by
// the captures below, so it's an orphan. Per-worker but race-free - fresh
// captures are always newer than runStart, so no worker deletes another's.
test.beforeAll(({}, testInfo) => {
  const dir = join(screenshotRoot, testInfo.project.name);
  // globalSetup stamps "skip" for a filtered (-g) run - pruning there would
  // delete every capture the filter didn't regenerate.
  const runStart = Number(readFileSync(runStartFile, "utf8"));
  if (!Number.isFinite(runStart)) return;
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return; // first run for this project - nothing to prune
  }
  for (const file of files) {
    const path = join(dir, file);
    // Workers prune in parallel; a sibling may have deleted this orphan first.
    try {
      if (statSync(path).mtimeMs < runStart) rmSync(path);
    } catch { /* already pruned */ }
  }
});

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

test("Practice landing with measured recommendation", async ({ page }, testInfo) => {
  await mockAuthenticatedSession(page)
  await mockTrpc(page, { timelineEvidence: [impactTimeline(1), impactTimeline(2)] })
  await page.goto("/practice")
  await expect(page.getByTestId("practice-recommendation")).toContainText("b→r")
  if (!testInfo.project.name.includes("mobile")) await page.getByTestId("side-primary-nav").hover()
  await capture(page, testInfo, "67-practice-landing-recommended")
})

test("Practice landing without measured evidence", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("typecafe:practice:custom-keys", JSON.stringify({ keys: ["q", "r"], durationSeconds: 30, textStyle: "pseudo" }))
    window.localStorage.setItem("typecafe:practice:custom-grams", JSON.stringify({ grams: ["th", "tion"], durationSeconds: 120, textStyle: "varied" }))
  })
  await page.goto("/practice")
  await expect(page.getByTestId("practice-empty")).toBeVisible()
  await capture(page, testInfo, "67b-practice-landing-find-focus")
})

test("Custom Keys Practice workspace", async ({ page }, testInfo) => {
  await page.goto("/practice?custom=keys")
  await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
  await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
  await expect(page.getByRole("region", { name: "Focus key editor" })).toBeVisible()
  await capture(page, testInfo, "67-custom-keys-practice")
})

test("Custom mixed Grams Practice workspace", async ({ page }, testInfo) => {
  await page.goto("/practice?custom=grams")
  await expect(page.getByTestId("custom-practice-workspace")).toBeVisible()
  await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
  await expect(page.getByRole("region", { name: "Gram editor" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Common in English" })).toBeVisible()
  await capture(page, testInfo, "68-custom-mixed-grams-practice")
})

test("Guided Practice workspace and awaiting-Test recap", async ({ page }, testInfo) => {
  await page.clock.install()
  const evidence = encodeURIComponent(JSON.stringify({
    metric: "ms", baseline: 110, observed: 186, sampleCount: 12,
    reason: "Recent Tests measured tion with 76 ms of extra pause.",
  }))
  await page.goto(`/drill?target=gram&gram=tion&policy=acquisition&evidence=${evidence}`)
  await expect(page).toHaveURL(/\/practice\?target=gram.*gram=tion/)
  await expect(page.getByTestId("guided-practice-intent")).toBeVisible()
  await expect(page.locator("#c0")).toHaveClass(/active-char/, { timeout: 20_000 })
  await capture(page, testInfo, "69-guided-practice")

  await page.getByRole("region", { name: "Practice controls" }).getByRole("button", { name: "30s" }).click()
  for (let index = 0; index < 80; index += 1) {
    await typeCurrentCharacter(page, index)
    await page.clock.runFor(30)
  }
  await page.clock.runFor(30_000)
  await expect(page.getByTestId("guided-awaiting-test")).toBeVisible()
  await capture(page, testInfo, "70-guided-practice-awaiting-test")
})

// /train lands on the level map; Continue zooms into the resume level.
async function gotoTrainLevel(page: Page) {
  await page.goto("/train");
  await expect(page.getByTestId("train-continue")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("train-continue").click();
  await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
}

async function openSettingsMenu(page: Page) {
  await page.getByTestId("typer-toolbar").getByRole("button", { name: "Open typing settings" }).click();
  await expect(page.getByTestId("settings-menu")).toBeVisible();
}

// Mode switches on the inline mode bar (the modal holds everything else).
function selectMode(page: Page, name: "Timed" | "Words") {
  return page.getByTestId("mode-bar").getByRole("button", { name }).click();
}

// Quotes is now a text source in the language picker rather than a mode button.
async function selectQuotesLanguage(page: Page) {
  await page.getByTestId("typer-toolbar").getByRole("button", { name: /^Language:/ }).click();
  await page.getByTestId("language-menu").getByRole("button", { name: "Quotes", exact: true }).click();
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
    // A slow first-run keyboard-layout probe may settle after typing starts. It
    // is cached for the next test boundary, never allowed to replace this prompt.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "keyboard", {
        configurable: true,
        value: {
          getLayoutMap: () => new Promise<Map<string, string>>((resolve) => {
            window.setTimeout(() => resolve(new Map([
              ["KeyY", "z"],
              ["KeyZ", "y"],
              ["Backslash", "#"],
            ])), 2_000);
          }),
        },
      });
    });
    await gotoHome(page);
    await expect(page.getByTestId("mode-bar").getByRole("button")).toHaveText(["timed", "words"]);
    await capture(page, testInfo, "01-home-default");

    // Type a few characters, including one mistake, to show progress and
    // error styling.
    await typeCurrentCharacter(page);
    await typeCurrentCharacter(page);
    await page.waitForTimeout(2_500);
    await expect(page.locator("#c2")).toHaveClass(/active-char/);
    await page.locator("#text").click();
    await page.keyboard.press("0");
    await capture(page, testInfo, "02-home-mid-test-with-error");
  });

  test("home: toolbar menus and mode contexts", async ({ page }, testInfo) => {
    await gotoHome(page);

    // Timed: the toolbar owns mode, length, and the vocabulary size/source; the
    // language itself is a global setting in the nav.
    await expect(page.getByTestId("toolbar-context").getByRole("button", { name: "15" })).toHaveAttribute("aria-pressed", "true");
    await openSettingsMenu(page);
    await capture(page, testInfo, "03-settings-timed");

    await page.keyboard.press("Escape");
    await page.getByTestId("typer-toolbar").getByRole("button", { name: "Language: English" }).click();
    await expect(page.getByTestId("language-menu")).toBeVisible();
    await capture(page, testInfo, "39-size-source-menu");
    await page.keyboard.press("Escape");

    // The global language lives in the nav globe menu.
    await page.getByTestId("nav-language-trigger").click();
    await expect(page.getByTestId("nav-language-menu")).toBeVisible();
    await capture(page, testInfo, "39b-nav-language-menu");
    await page.keyboard.press("Escape");

    // The global keyboard layout lives beside it.
    await page.getByTestId("nav-layout-trigger").click();
    await expect(page.getByTestId("nav-layout-menu")).toBeVisible();
    await capture(page, testInfo, "39c-nav-layout-menu");
    await page.keyboard.press("Escape");

    // Words is top-level and swaps the context controls beside the mode group.
    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "25" }).click();
    await capture(page, testInfo, "04-settings-words");

    await selectMode(page, "Timed");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "Custom" }).click();
    await expect(page.locator("#customLengthInput")).toBeVisible();
    await capture(page, testInfo, "06-settings-timed-custom-length");

    // ∞ (no timer) - the relaxed engine, now a length option on Timed.
    await selectMode(page, "Timed");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "No timer" }).click();
    await openSettingsMenu(page);
    await expect(page.getByTestId("settings-menu")).toBeVisible();
    await capture(page, testInfo, "08-settings-no-timer");
  });

  test("words mode: test view after closing modal", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectMode(page, "Words");
    await page.getByTestId("toolbar-context").getByRole("button", { name: "25", exact: true }).click();

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "23-test-view-words-mode");
  });

  test("timed mode: punctuation, capitals and numbers test view", async ({ page }, testInfo) => {
    // Cycle through known 5k entries so the tour visibly covers canonical
    // country, state, and initialism casing instead of relying on random luck.
    await page.addInitScript(() => {
      const values = [656, 558, 1016, 3589].map((index) => (index + 0.5) / 4971);
      let call = 0;
      Math.random = () => values[call++ % values.length]!;
    });
    await gotoHome(page);
    await page.getByTestId("typer-toolbar").getByRole("button", { name: /^Language: English/ }).click();
    await page.getByTestId("language-menu").getByRole("button", { name: "English 5k", exact: true }).click();
    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /punctuation/ }).click();
    await page.getByTestId("settings-menu").getByRole("button", { name: /capitals/ }).click();
    await page.getByTestId("settings-menu").getByRole("button", { name: /numbers/ }).click();
    await page.keyboard.press("Escape");

    await expect(page.locator("#words .char").first()).toBeVisible();
    // Numbers guarantees realistic numeric tokens without changing the test's
    // configured token count.
    await expect(page.locator("#words")).toContainText(/[0-9]/);
    await expect(page.locator("#words")).toContainText(/Australia|Texas/);
    await expect(page.locator("#words")).toContainText(/PDF|NASA/);
    await capture(page, testInfo, "24-test-view-punctuation-capitals");
  });

  test("no-timer (∞) test view", async ({ page }, testInfo) => {
    await gotoHome(page);
    await page.getByTestId("toolbar-context").getByRole("button", { name: "No timer" }).click();

    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "27-test-view-no-timer");
  });

  test("quotes mode: test view with length buckets", async ({ page }, testInfo) => {
    await gotoHome(page);
    await selectQuotesLanguage(page);

    await expect(page.getByTestId("quote-length-bar")).toBeVisible();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await capture(page, testInfo, "28-test-view-quotes-mode");
  });

  test("fullscreen test view", async ({ page }, testInfo) => {
    await gotoHome(page);

    await page.locator("[aria-label='Enter fullscreen']").click();
    await expect(page.locator("[aria-label='Exit fullscreen']")).toBeVisible();
    await capture(page, testInfo, "28-test-view-fullscreen");
  });

  test("train page: level map and tier switching", async ({ page }, testInfo) => {
    await page.goto("/train");
    await expect(page.getByTestId("train-continue")).toBeVisible({ timeout: 20_000 });
    await capture(page, testInfo, "34-train-level-map");

    // Tier tabs replace the difficulty dropdown.
    await page.getByTestId("train-tiers").getByRole("button", { name: "hard" }).click();
    await expect(page.getByText("Hard tier")).toBeVisible();
    await capture(page, testInfo, "33-train-hard-difficulty");
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

    await openSettingsMenu(page);
    await page.getByTestId("settings-menu").getByRole("button", { name: /numbers/ }).click();
    await page.keyboard.press("Escape");

    // Shorten the test to 3 seconds so the completion dashboard appears fast.
    await setToolbarCustomLength(page, "3");

    // Focus the typing surface before the first keystroke - committing the custom
    // length can leave focus on the toolbar, dropping a bare keyboard press.
    await page.locator("#text").click();
    await typeCurrentCharacter(page);
    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    // Honest-review 2026-07 §2: a 3s custom test is unranked, so the card wears
    // the Unranked badge and no flattery - the save's brag/delta/streak must not
    // render. (The ranked chips are pinned in shared-score.spec.ts.)
    await expect(page.getByText("Unranked")).toBeVisible();
    await expect(page.getByText("Numbers", { exact: true })).toBeVisible();
    await expect(page.getByTestId("avg-delta")).toHaveCount(0);
    await expect(page.getByTestId("score-streak")).toHaveCount(0);
    await capture(page, testInfo, "13-score-card-after-test");
  });

  test("home: post-test diagnosis panel and drill handoff", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { timelineEvidence: [higherOrderTimeline(1), higherOrderTimeline(2)] });
    await gotoHome(page);

    // A short custom timed test, long enough to clear the 30-keystroke diagnosis
    // floor; 50 wrong keystrokes guarantee an honest "least accurate keys" finding.
    await setToolbarCustomLength(page, "4");

    await typeWrongZeroes(page, 50);

    await expect(page.getByRole("button", { name: "Test Again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Diagnosis", { exact: true })).toBeVisible();
    // Recent history alone must not leak a stale pattern into this score card.
    await expect(page.getByTestId("diagnosis-higher-order")).toHaveCount(0);
    // The mini per-key heatmap renders alongside the findings (Phase 1.5).
    await expect(page.getByTestId("diagnosis-heatmap")).toBeVisible();
    const diagnosisBox = await page.getByTestId("diagnosis-panel").boundingBox();
    const chartBox = await page.getByTestId("wpm-chart").boundingBox();
    expect(diagnosisBox?.y).toBeLessThan(chartBox?.y ?? 0);
    const authBox = await page.getByTestId("nav-auth-trigger").boundingBox();
    expect((authBox?.x ?? 0) + (authBox?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    await capture(page, testInfo, "35-score-card-diagnosis");

    // The one-click Finding hands off to the shared Guided Practice workspace.
    await page.getByRole("link", { name: /Practise these keys/ }).first().click();
    await expect(page.getByTestId("guided-practice-intent")).toBeVisible();
    await capture(page, testInfo, "36-guided-practice-handoff");
  });

  test("train page", async ({ page }, testInfo) => {
    await gotoTrainLevel(page);
    await capture(page, testInfo, "14-train-default");
  });

  test("train full alphabet: German on pinned QWERTY excludes umlauts", async ({ page }, testInfo) => {
    // L45 is the first full-alphabet rung. Pin the board before navigation so
    // the Train page never briefly resolves German's automatic QWERTZ layout.
    await page.addInitScript(() => {
      Math.random = () => 0; // first reachable German word is "ich"
      window.localStorage.setItem("typecafe:language", JSON.stringify("german"));
      window.localStorage.setItem("typecafe:layout", JSON.stringify("qwerty"));
      const cleared = Array.from({ length: 44 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });

    await gotoTrainLevel(page);
    await expect(page.getByTestId("train-rail-caption")).toContainText("Level 45");
    await expect(page.getByTestId("nav-layout-trigger")).toHaveAttribute("aria-label", "Keyboard layout: QWERTY");
    await expect(page.locator("#words")).toContainText("ich");
    await expect(page.locator("#words")).not.toContainText(/[äöü]/);
    await capture(page, testInfo, "67-train-german-pinned-qwerty");
  });

  test("train level complete popover", async ({ page }, testInfo) => {
    await gotoTrainLevel(page);
    await typeVisibleTestText(page);
    await expect(page.getByTestId("train-complete-popover")).toBeVisible();
    await capture(page, testInfo, "57-train-level-complete");
  });

  test("train speed round (timed)", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 3 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });
    await gotoTrainLevel(page);
    await expect(page.getByTestId("timed-countdown")).toBeVisible();
    await capture(page, testInfo, "59-train-speed-round");
  });

  test("train no-miss failed popover", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 6 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });
    await gotoTrainLevel(page);
    await typeCurrentCharacter(page, 0);
    await typeWrongCharacter(page, 1);
    await expect(page.getByTestId("train-complete-popover")).toBeVisible();
    await capture(page, testInfo, "60-train-no-miss-failed");
  });

  test("train boss failed popover", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const cleared = Array.from({ length: 9 }, (_, i) => ({
        options: `Level ${i + 1}`, speed: 200, accuracy: 100, stars: 3,
      }));
      window.localStorage.setItem("typecafe.trainProgress.easy", JSON.stringify(cleared));
    });
    await gotoTrainLevel(page);
    // Start the run, then stall so the pacer overtakes and the boss fails.
    await typeCurrentCharacter(page, 0);
    await expect(page.getByTestId("train-complete-popover")).toBeVisible({ timeout: 10_000 });
    await capture(page, testInfo, "61-train-boss-failed");
  });

  test("train level failed popover", async ({ page }, testInfo) => {
    await gotoTrainLevel(page);
    await typeCurrentCharacter(page);
    const remaining = await page.locator("#words .char").count();
    for (let index = 1; index < remaining; index += 1) await page.keyboard.press("q");
    await expect(page.getByTestId("train-complete-popover")).toBeVisible();
    await capture(page, testInfo, "58-train-level-failed");
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

  test("profile loading skeleton", async ({ page }, testInfo) => {
    let releaseProfile = () => {};
    const profileHold = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });

    await mockTrpc(page);
    await page.route("**/api/trpc/user.getProfileByUsername**", async (route) => {
      await profileHold;
      await route.fallback();
    });
    await page.goto("/profile/testuser");
    await expect(page.getByTestId("profile-loading-skeleton")).toBeVisible();
    await capture(page, testInfo, "17-profile-loading");
    releaseProfile();
  });

  test("public profile page", async ({ page }, testInfo) => {
    await mockTrpc(page);
    await page.goto("/profile/testuser");
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "https://typecafe.vercel.app" })).toHaveAttribute("target", "_blank");
    await capture(page, testInfo, "17-profile-public");
  });

  test("public profile not found", async ({ page }, testInfo) => {
    await mockTrpc(page, { missingProfile: true });
    await page.goto("/profile/missing-user");
    await expect(page.getByRole("heading", { name: "Profile not found" })).toBeVisible();
    await capture(page, testInfo, "17-profile-not-found");
  });

  test("progress dashboard loading skeleton", async ({ page }, testInfo) => {
    let releaseSession = () => {};
    const sessionHold = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });

    await page.route("**/api/auth/session", async (route) => {
      await sessionHold;
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
    await mockTrpc(page);
    await page.goto("/progress");
    await expect(page.getByTestId("progress-loading-skeleton")).toBeVisible();
    await capture(page, testInfo, "40-progress-loading");
    releaseSession();
  });

  test("progress dashboard (authenticated, rich history)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      keyStats: [
        { character: "a", total: 200, correct: 198 },
        { character: "e", total: 320, correct: 305 },
        { character: "r", total: 120, correct: 96 },
        { character: "t", total: 160, correct: 150 },
        { character: "b", total: 60, correct: 42 },
      ],
      transitionStats: [
        { pair: "br", count: 10, totalMs: 5000, errors: 2 },
        { pair: "io", count: 10, totalMs: 4500, errors: 1 },
        { pair: "rv", count: 10, totalMs: 4000, errors: 1 },
        { pair: "dv", count: 10, totalMs: 3500, errors: 1 },
        { pair: "eb", count: 10, totalMs: 3000, errors: 1 },
        { pair: "gh", count: 10, totalMs: 2800, errors: 1 },
        { pair: "th", count: 1000, totalMs: 100000, errors: 0 },
      ],
      sameDayProgress: true,
      coachingHistory: progressCoachingHistory(),
      timelineEvidence: [impactTimeline(1), impactTimeline(2)],
    });
    await page.goto("/progress");
    await expect(page.getByTestId("headline-delta")).toBeVisible();
    await expect(page.getByTestId("headline-start-current")).toContainText("Start");
    await expect(page.getByTestId("headline-current")).toContainText("Current daily median");
    if (testInfo.project.name.includes("mobile")) {
      const card = await page.getByTestId("headline-delta").boundingBox();
      const current = await page.getByTestId("headline-current").boundingBox();
      const viewport = page.viewportSize();
      expect(card).not.toBeNull();
      expect(current).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(current!.x + current!.width).toBeLessThanOrEqual(card!.x + card!.width);
      expect(card!.x + card!.width).toBeLessThanOrEqual(viewport!.width);
    }
    await expect(page.getByText("WPM over time", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily median trend", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily best trend", { exact: true })).toBeVisible();
    await expect(page.getByTestId("progress-coach")).toContainText("Work on b→r");
    await expect(page.getByTestId("progress-coach")).not.toContainText("Coach ·");
    await expect(page.getByTestId("records-timeline")).toHaveCount(0);
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
    await capture(page, testInfo, "40-progress-dashboard");
    if (!testInfo.project.name.includes("mobile")) {
      await page.getByTestId("trend-tabs").getByRole("button", { name: "Accuracy" }).click();
      await expect(page.getByText("Daily average trend", { exact: true })).toBeVisible();
      await capture(page, testInfo, "40d-progress-daily-accuracy");
      await page.getByTestId("trend-tabs").getByRole("button", { name: "Consistency" }).click();
      await capture(page, testInfo, "40e-progress-daily-consistency");
      await page.getByTestId("trend-tabs").getByRole("button", { name: "WPM" }).click();
      await page.getByTestId("progress-coach").getByRole("button", { name: /e→r/ }).click();
      await expect(page.getByTestId("coach-detail")).toContainText("Target detail");
      await capture(page, testInfo, "40c-progress-target-detail");
    }
    await page.getByTestId("lifetime-keyboard-card").scrollIntoViewIfNeeded();
    await capture(page, testInfo, "40-progress-lifetime-keyboard");
    await page.getByRole("link", { name: "How keyboard accuracy is calculated" }).hover();
    await expect(page.getByRole("tooltip")).toContainText("accuracy from recent natural Tests");
    await capture(page, testInfo, "40c-progress-keyboard-help-tooltip");
    // The layer switch flips the lifetime heatmap to the shift layer.
    await page.getByTestId("lifetime-heatmap-layers").getByRole("button", { name: "Show shifted keys (capitals and symbols)" }).click();
    await expect(page.getByTestId("lifetime-heatmap").locator('[data-kb-key="R"]')).toBeVisible();
    await capture(page, testInfo, "40b-progress-lifetime-keyboard-shift");
  });

  test("progress dashboard (completed Target in ledger)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      coachingSession: completedKeyAccuracySession(),
      coachingHistory: [],
      timelineEvidence: [crowdedAccuracyTimeline(1), crowdedAccuracyTimeline(2)],
    });
    await page.goto("/progress");
    const rRow = page.getByTestId("progress-coach").getByRole("button", { name: /^r Key/ });
    await expect(rRow).toContainText("80.0%");
    await rRow.click();
    await expect(page.getByTestId("target-practice-summary").last()).toContainText("Practice-context performance100.0%");
    await capture(page, testInfo, "40f-progress-completed-target");
  });

  test("progress dashboard (Practice track awaiting Test)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      timelineEvidence: [brDrillTimeline(3), impactTimeline(1), impactTimeline(2)],
    });
    await page.goto("/progress");
    const coach = page.getByTestId("progress-coach");
    if (testInfo.project.name.includes("mobile")) await coach.getByRole("button", { name: /b→r/ }).click();
    const detail = testInfo.project.name.includes("mobile")
      ? coach.getByTestId("coach-inline-detail")
      : coach.getByTestId("coach-detail");
    const practiceTrack = detail.getByTestId("target-practice-summary");
    await expect(practiceTrack).toContainText("Practice track");
    await expect(detail).toContainText("practised · awaiting Test");
    await expect(detail.getByRole("link", { name: "Take a Test" })).toBeVisible();
    await expect(detail.getByRole("link", { name: "Practise again" })).toBeVisible();
    if (testInfo.project.name.includes("mobile")) await practiceTrack.scrollIntoViewIfNeeded();
    await capture(page, testInfo, "40g-progress-practice-awaiting-test");
  });

  test("progress dashboard (plateau Target guidance)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { flatProgress: true });
    await page.goto("/progress");
    await expect(page.getByTestId("plateau-headline")).toBeVisible();
    // The plateau headline is the single coach voice here - the stance card must
    // not also render "nothing to change" beside it (the old contradiction).
    await expect(page.getByTestId("stance")).toHaveCount(0);
    await capture(page, testInfo, "47-progress-plateau");
  });

  test("progress dashboard (goal trajectory)", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:goal", JSON.stringify({ targetWpm: 100, targetDate: "2027-12-31" }));
    });
    await page.goto("/progress");
    await expect(page.getByTestId("goal-status")).toBeVisible();
    await capture(page, testInfo, "46-progress-goal");
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

  // Daily challenge captures removed (2026-07): the surface is hidden - no nav
  // entry, no coach tab - so the tour no longer reviews it. Restore from git
  // history alongside the nav/coach-tab code when the challenge returns.

  test("navigation: expanded side rail", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "The side rail is desktop-only.");
    await gotoHome(page);
    const homeButton = page.getByTestId("side-primary-nav").getByRole("link", { name: "Home" });
    await homeButton.hover();
    await expect(homeButton.locator("div").getByText("Home", { exact: true })).toBeVisible();
    await capture(page, testInfo, "58-nav-expanded");
  });

  test("navigation: More popover", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "The side rail is desktop-only.");
    await gotoHome(page);
    await expect(page.getByTestId("side-primary-nav").locator(".material-symbols-rounded").first()).toHaveText("home");
    // Hover expands the rail; clicking More opens the rolled-up footer links.
    await page.getByTestId("nav-more").hover();
    await page.getByTestId("nav-more").click();
    await expect(page.getByTestId("nav-more-menu")).toBeVisible();
    await capture(page, testInfo, "58-nav-more-popover");
  });

  test("home: targeted drill coach tab", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "The rail coach tabs are desktop-only.");
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoHome(page);
    const tab = page.getByTestId("home-coach-tab-drill");
    await expect(tab).toBeVisible();
    await tab.hover();
    await expect(page.getByTestId("home-coach-tab-drill-panel")).toBeVisible();
    await capture(page, testInfo, "69-home-drill-coach-tab");
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

    // The share menu: one entry point, all targets revealed together in place.
    await page.getByRole("button", { name: "Share Score" }).click({ force: true });
    await expect(page.getByTestId("share-menu").getByRole("menuitem", { name: "Share on X" })).toBeVisible();
    await capture(page, testInfo, "18b-shared-score-share-menu");
  });

  test("shared score page (guest, no account)", async ({ page }, testInfo) => {
    // A snapshot-only share minted by a signed-out guest - no Test row backs it.
    await mockTrpc(page);
    await page.goto("/score/guest-score-share");
    await expect(page.getByTestId("score-screenshot-card")).toBeVisible();
    await expect(page.getByText("WPM Over Time")).toBeVisible();
    await capture(page, testInfo, "64-shared-score-guest");
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
    await expect(page.locator('input[name="website"]')).toBeHidden();
    await capture(page, testInfo, "19-contact");

    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await capture(page, testInfo, "20-support");

    await page.goto("/how-we-measure");
    await expect(page.getByRole("heading", { name: "How TypeCafe Measures Typing" })).toBeVisible();
    await expect(page.getByText(/replayed on the server from the full keystroke and backspace timeline/i)).toBeVisible();
    await expect(page.getByText(/calculating net WPM for each test first/i)).toBeVisible();
    await expect(page.getByText(/classifies the expected layout geometry, not the finger/i)).toBeVisible();
    await expect(page.getByText(/Transfer and Cold checks target at least 6 samples/i)).toBeVisible();
    await expect(page.getByText(/first held Cold check returns after 3 practiced days/i)).toBeVisible();
    await capture(page, testInfo, "55-how-we-measure");

    await page.goto("/guides");
    await expect(page.getByRole("heading", { name: "Typing Guides" })).toBeVisible();
    await expect(page.getByTestId("guides-grid")).toBeVisible();
    await capture(page, testInfo, "68-guides");

    await page.goto("/how-to-type-faster");
    await expect(page.getByRole("heading", { name: "How to Type Faster", exact: true })).toBeVisible();
    await capture(page, testInfo, "65-how-to-type-faster");

    await page.goto("/how-ngrams-work");
    await expect(page.getByRole("heading", { name: "How N-grams Work", exact: true })).toBeVisible();
    await capture(page, testInfo, "66-how-ngrams-work");

    await page.goto("/keyboard-layouts");
    await expect(page.getByRole("heading", { name: "Keyboard Layouts Explained", exact: true })).toBeVisible();
    await capture(page, testInfo, "67-keyboard-layouts");

    await page.goto("/stuck-at-60-70-wpm");
    await expect(page.getByRole("heading", { name: "Stuck at 60–70 WPM?", exact: true })).toBeVisible();
    await capture(page, testInfo, "69-stuck-at-60-70-wpm");

    await page.goto("/spacebar-slowing-down-typing");
    await expect(page.getByRole("heading", { name: "Is Your Spacebar Slowing You Down?", exact: true })).toBeVisible();
    await capture(page, testInfo, "70-spacebar-slowing-down-typing");

    await page.goto("/slowest-key-transitions");
    await expect(page.getByRole("heading", { name: "Find Your Slowest Key Transitions", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Take a test to reveal your slowest transition" })).toHaveAttribute("href", "/");
    await capture(page, testInfo, "71-slowest-key-transitions");

    await page.goto("/15-second-vs-60-second-wpm");
    await expect(page.getByRole("heading", { name: "15-Second vs. 60-Second WPM", exact: true })).toBeVisible();
    await capture(page, testInfo, "72-15-second-vs-60-second-wpm");

    await page.goto("/typing-consistency");
    await expect(page.getByRole("heading", { name: "What Typing Consistency Actually Means", exact: true })).toBeVisible();
    await capture(page, testInfo, "73-typing-consistency");

    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();
    await expect(page.getByText(/actual mistyped character.*does not record typing outside/i)).toBeVisible();
    await capture(page, testInfo, "21-privacy-policy");

    await page.goto("/terms-and-conditions");
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();
    await capture(page, testInfo, "22-terms-and-conditions");
  });
});
