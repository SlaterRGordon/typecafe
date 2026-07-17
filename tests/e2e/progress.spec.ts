import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";
import { completedKeyAccuracySession, progressCoachingHistory } from "./helpers/coachingFixtures";
import { crowdedAccuracyTimeline, impactTimeline } from "./helpers/evidence";
import { DAILY_COACHING_STORAGE_KEY, GUEST_DAILY_SCOPE } from "../../src/lib/dailyCoaching";

async function gotoProgress(page: Page) {
  await page.goto("/progress");
}

test.describe("progress dashboard", () => {
  test("shows a dashboard skeleton while progress is loading", async ({ page }) => {
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
    await gotoProgress(page);

    await expect(page.getByTestId("progress-loading-skeleton")).toBeVisible();
    await expect(page.getByTestId("progress-loading-skeleton")).toHaveAttribute("aria-busy", "true");

    releaseSession();
    await expect(page.getByTestId("headline-delta")).toBeVisible();
  });

  test("progress rescopes to the global language", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoProgress(page);

    // Default English view: the mocked records are English, so there is history.
    await expect(page.getByTestId("progress-language-chip")).toHaveText("English");
    await expect(page.getByTestId("headline-delta")).toBeVisible();

    // Switching language in the nav rescopes progress - no French records → empty.
    await page.getByTestId("nav-language-trigger").click();
    await page.getByTestId("nav-language-menu").getByRole("button", { name: "French" }).click();
    await expect(page.getByTestId("progress-language-chip")).toHaveText("French");
    await expect(page.getByText("No tests yet")).toBeVisible();
  });

  test("progress rescopes to the active layout's stats pool", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoProgress(page);

    // Default qwerty view: the mocked (untagged → qwerty pool) records have history.
    await expect(page.getByTestId("progress-layout-chip")).toHaveText("QWERTY");
    await expect(page.getByTestId("headline-delta")).toBeVisible();
    await expect(page.getByText("No tests yet")).toHaveCount(0);

    // A remap layout is its own motor pool - no Colemak history → empty trend,
    // even though the same tests populate the qwerty pool. The chip names it.
    await page.getByTestId("nav-layout-trigger").click();
    await page.getByTestId("nav-layout-menu").getByRole("button", { name: "Colemak", exact: true }).click();
    await expect(page.getByTestId("progress-layout-chip")).toHaveText("Colemak");
    await expect(page.getByText("No tests yet")).toBeVisible();

    // National layouts share the qwerty pool, so the history is back.
    await page.getByTestId("nav-layout-trigger").click();
    await page.getByTestId("nav-layout-menu").getByRole("button", { name: "QWERTZ (DE)", exact: true }).click();
    await expect(page.getByTestId("progress-layout-chip")).toHaveText("QWERTZ (DE)");
    await expect(page.getByText("No tests yet")).toHaveCount(0);
  });

  test("a signed-in user with history sees their delta, trends, and adaptive Coach", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      keyStats: [{ character: "r", total: 120, correct: 96 }, { character: "e", total: 300, correct: 290 }],
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
    await gotoProgress(page);

    // The headline delta is the largest number on the page and answers
    // "am I getting faster?" - the mocked history rises, so it's positive.
    const headline = page.getByTestId("headline-delta");
    await expect(headline).toBeVisible();
    await expect(headline.getByText(/\+\d/)).toBeVisible();
    await expect(page.getByTestId("headline-delta-value")).toHaveAttribute("data-placement", "above-low");
    await expect(headline.getByText("WPM").first()).toBeVisible();
    await expect(page.getByTestId("headline-start-current")).toContainText("Start");
    await expect(page.getByTestId("headline-current")).toContainText("Current daily median");
    const latestDaily = await page.getByTestId("headline-current").textContent();

    // The practice streak chip shows (the mocked history reaches today).
    await expect(page.getByTestId("streak-chip")).toBeVisible();
    const targets = page.getByTestId("progress-coach");
    await expect(targets).toContainText("Your targets");
    await expect(targets).toContainText("b→r");
    await expect(targets).toContainText("Transition");
    await expect(targets).toContainText("b→r pause is slow");
    await expect(targets).toContainText("focus");
    await expect(targets.getByText("Needs work", { exact: true })).toHaveCount(0);
    const targetFilters = page.getByTestId("coach-target-filters");
    await expect(targetFilters.getByRole("button", { name: /Transitions/ })).toBeVisible();
    await expect(targetFilters.getByRole("button", { name: /Keys/ })).toBeVisible();
    await expect(targetFilters.getByRole("button", { name: /Patterns/ })).toBeVisible();
    await expect(targetFilters.getByRole("button", { name: /Movements/ })).toBeVisible();
    const brButton = targets.getByRole("button", { name: /b→r/ });
    if ((page.viewportSize()?.width ?? 0) < 640) await brButton.click();
    else await brButton.hover();
    const brPractice = brButton.locator("../..").getByRole("link", { name: "Practice this transition" });
    await expect(brPractice).toHaveAttribute("href", /transitions=br/);
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(brPractice).toHaveCSS("opacity", "1");
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect.poll(async () => brPractice.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe("rgba(0, 0, 0, 0)");
    }
    await expect(page.getByTestId("progress-recap")).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const left = await page.getByTestId("progress-left-column").boundingBox();
      const right = await page.getByTestId("progress-coach-column").boundingBox();
      expect(left).not.toBeNull();
      expect(right).not.toBeNull();
      expect(Math.abs(left!.width - right!.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(left!.height - right!.height)).toBeLessThanOrEqual(2);
      const targetScroll = page.getByTestId("coach-target-scroll");
      await expect(targetScroll).toHaveCSS("overflow-y", "auto");
      await expect(targets.getByText("Recent", { exact: true })).toBeVisible();
      await expect(targets.getByText("Trend", { exact: true })).toBeVisible();
      await expect(targets.getByText("Worth", { exact: true })).toBeVisible();
    }

    // One big trend chart, WPM by default, with metric tabs to toggle it.
    await expect(page.getByText("WPM over time", { exact: true })).toBeVisible();
    await expect(page.getByTestId("trend-chart")).toHaveCount(1);
    await expect(page.getByText("Daily median trend", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily best trend", { exact: true })).toBeVisible();
    await page.getByTestId("trend-point-0").hover();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Median net WPM");
    await expect(page.getByTestId("trend-tooltip")).toContainText("Daily best");
    await expect(page.getByTestId("trend-tooltip")).toContainText("ranked test");
    await expect(page.getByTestId("trend-tooltip")).toContainText("Average accuracy");
    await expect(page.getByTestId("trend-tooltip")).toContainText("Average consistency");
    await page.getByTestId("trend-point-0").focus();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Median net WPM");
    const dailyPointCount = await page.locator('[data-testid^="trend-point-"]').count();
    expect(dailyPointCount).toBeGreaterThan(1);
    const trendTabs = page.getByTestId("trend-tabs");
    await trendTabs.getByRole("button", { name: "Accuracy" }).click();
    await expect(page.getByText("Accuracy over time", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily average trend", { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid^="trend-point-"]')).toHaveCount(dailyPointCount);
    await page.getByTestId("trend-point-0").hover();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Average accuracy");
    await trendTabs.getByRole("button", { name: "Consistency" }).click();
    await expect(page.getByText("Consistency over time", { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid^="trend-point-"]')).toHaveCount(dailyPointCount);
    await page.getByTestId("trend-point-0").hover();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Average consistency");
    await trendTabs.getByRole("button", { name: "WPM" }).click();
    await expect(page.getByText("WPM over time", { exact: true })).toBeVisible();
    await page.getByTestId("period-switcher").getByRole("button", { name: "7d" }).click();
    await expect(page.getByText("Daily best trend", { exact: true })).toBeVisible();
    // Current is the latest observed daily median, so changing the period keeps
    // it stable. Two practiced days are enough for an honest endpoint delta;
    // skipped calendar dates never count as zero or impose an activity quota.
    await expect(page.getByTestId("headline-current")).toHaveText(latestDaily ?? "");
    await expect(page.getByTestId("headline-start-current").getByText(/[+-]\d/)).toBeVisible();
    await expect(page.getByTestId("baseline-calibration")).toHaveCount(0);

    // Best WPM is a header chip now (the rest of the stat cells are gone).
    await expect(page.getByTestId("best-wpm-chip")).toContainText("Best");

    const coach = page.getByTestId("progress-coach");
    await expect(coach).toContainText("Coach · Next action");
    await expect(coach).toContainText("See whether your tion gain held");
    await expect(coach.getByRole("link", { name: "Start Cold check" }).first()).toHaveAttribute("href", "/plan");
    await expect(coach).toContainText("Baseline 520 ms");
    await expect(coach).toContainText("Transfer 455 ms");
    await expect(page.getByTestId("records-timeline")).toHaveCount(0);
    await expect(page.getByTestId("lifetime-keyboard-card")).toContainText("Your keyboard");
    // The legend now shares the Practice board's vocabulary (accuracy / speed / no data).
    const keyboardCard = page.getByTestId("lifetime-keyboard-card");
    await expect(keyboardCard).toContainText("high → low");
    await expect(keyboardCard).toContainText("speed");
    await expect(keyboardCard).toContainText("no data yet");
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
    const rKey = page.getByTestId("lifetime-heatmap").locator('[data-kb-key="r"]');
    await expect(rKey).not.toContainText("%");
    // Speed bar (Option A): r has lifetime transitions, so its cap carries a bar,
    // and its tooltip states the avg latency alongside accuracy.
    await expect(rKey.locator("[data-kb-speed]")).toHaveCount(1);
    await rKey.hover();
    await expect(page.getByRole("tooltip")).toContainText("Base r: 80% accuracy");
    await expect(page.getByRole("tooltip")).toContainText("Speed:");
    const keyboardHelp = page.getByRole("link", { name: "How keyboard accuracy is calculated" });
    await keyboardHelp.hover();
    await expect(page.getByRole("tooltip")).toContainText("rolling accuracy from recent attempts");
    // The heatmap flips layers: shift renders each cell's shifted twin with its
    // own tally (1 → !), and flipping back restores the base glyphs.
    const heatmap = page.getByTestId("lifetime-heatmap");
    await expect(heatmap.locator('[data-kb-key="1"]')).toBeVisible();
    const shiftLayerButton = page.getByTestId("lifetime-heatmap-layers").getByRole("button", { name: "Show shifted keys (capitals and symbols)" });
    await shiftLayerButton.click();
    await expect(heatmap.locator('[data-kb-key="!"]')).toBeVisible();
    await expect(heatmap.locator('[data-kb-key="R"]')).toBeVisible();
    // Speed bars are base-layer only (we don't track shifted-glyph speed).
    await expect(heatmap.locator('[data-kb-speed]')).toHaveCount(0);
    await shiftLayerButton.click();
    await expect(heatmap.locator('[data-kb-key="1"]')).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const keyboardBox = await page.getByTestId("lifetime-keyboard-card").boundingBox();
      const coachBox = await coach.boundingBox();
      expect(keyboardBox).not.toBeNull();
      expect(coachBox).not.toBeNull();
      expect(coachBox!.width).toBeGreaterThan(keyboardBox!.width * 0.55);
    }

    // Removed in slice 6: the 1-user self-league trap and the on-page challenge.
    await expect(page.getByTestId("self-league-card")).toHaveCount(0);
    await expect(page.getByTestId("daily-challenge")).toHaveCount(0);
  });

  test("the period switcher rescopes the dashboard", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoProgress(page);

    const switcher = page.getByTestId("period-switcher");
    await expect(switcher).toBeVisible();

    await switcher.getByRole("button", { name: "All" }).click();
    await expect(switcher.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();

    await switcher.getByRole("button", { name: "7d" }).click();
    await expect(switcher.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
  });

  test("progress combines all modes and lengths with no filter controls", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { mixedProgress: true });
    await gotoProgress(page);

    // Mode/length filters are gone - every test rolls into one combined view.
    await expect(page.getByTestId("progress-filters")).toHaveCount(0);
    await expect(page.getByTestId("progress-mode-filter")).toHaveCount(0);
    await expect(page.getByTestId("progress-length-filter")).toHaveCount(0);
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
  });

  test("a signed-in user with no history sees the take-a-test empty state", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { emptyScores: true });
    await gotoProgress(page);

    await expect(page.getByText("No tests yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Take a test" })).toBeVisible();
    await expect(page.getByTestId("trend-chart")).toHaveCount(0);
  });

  test("setting a goal projects an honest trajectory", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoProgress(page);

    // Demoted to a one-liner: expand it before setting a goal.
    const goal = page.getByTestId("goal-card");
    await expect(goal).toBeVisible();
    await goal.getByRole("button", { name: "Set a goal →" }).click();
    await goal.getByLabel("Target WPM").fill("100");
    await goal.getByLabel("Target date").fill("2027-12-31");
    await goal.getByRole("button", { name: "Set goal" }).click();

    // The rising mock history reaches 100 well before a far-future deadline.
    await expect(page.getByTestId("goal-status")).toContainText("On track");

    // A tight deadline flips it to an honest "behind" with the required pace.
    await goal.getByRole("button", { name: "Edit" }).click();
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await goal.getByLabel("Target date").fill(soon);
    await goal.getByRole("button", { name: "Update goal" }).click();
    await expect(page.getByTestId("goal-status")).toContainText("Behind");
    await expect(page.getByTestId("goal-status")).toContainText("projected");
  });

  test("a flat trend shows the plateau coach voice", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { flatProgress: true });
    await gotoProgress(page);

    const plateau = page.getByTestId("plateau-headline");
    await expect(plateau).toBeVisible();
    await expect(plateau).toContainText("Plateaued for");
    await expect(plateau).toContainText("Your recent net WPM trend has stayed nearly flat. Follow the Coach action, then re-measure.");
    await expect(plateau.getByRole("link", { name: "Try transition drills" })).toHaveCount(0);
  });

  test("inspects another Target without changing or saving the Coach next action", async ({ page }) => {
    const calls: string[] = [];
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      coachingHistory: progressCoachingHistory(),
      timelineEvidence: [impactTimeline(1), impactTimeline(2)],
      onProcedure: (procedure) => calls.push(procedure),
    });
    await gotoProgress(page);

    const coach = page.getByTestId("progress-coach");
    await expect(coach).toContainText("See whether your tion gain held");
    const erRow = coach.getByRole("button", { name: /e→r/ });
    await erRow.focus();
    await erRow.press("Enter");
    await expect(erRow).toHaveAttribute("aria-expanded", "true");

    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const detail = page.getByTestId("coach-detail");
      await expect(detail).toContainText("Target detail");
      await expect(detail).toContainText("Your e→r gain held");
      await expect(detail.getByRole("list", { name: "e→r qualifying episodes" }).getByRole("listitem")).toHaveCount(2);
      await detail.getByRole("button", { name: "Back to next action: tion" }).click();
      await expect(detail).toContainText("See whether your tion gain held");
    } else {
      await expect(page.getByTestId("coach-inline-detail")).toContainText("No extra Drill is prescribed");
      await expect(page.getByTestId("coach-inline-detail").getByRole("list", { name: "e→r qualifying episodes" }).getByRole("listitem")).toHaveCount(2);
      await expect(page.getByTestId("coach-detail")).toContainText("See whether your tion gain held");
    }

    await erRow.click();
    await page.getByTestId("coach-target-filters").getByRole("button", { name: /Keys/ }).click();
    await expect(page.getByTestId("coach-inline-detail")).toHaveCount(0);
    await expect(page.getByTestId("coach-detail")).toContainText("See whether your tion gain held");
    expect(calls).not.toContain("coachingSession.save");
    await expect(page.getByTestId("records-timeline")).toHaveCount(0);
  });

  test("shows today's completed Target while bounded coaching history catches up", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      coachingSession: completedKeyAccuracySession(),
      coachingHistory: [],
      timelineEvidence: [crowdedAccuracyTimeline(1), crowdedAccuracyTimeline(2)],
    });
    await gotoProgress(page);

    const coach = page.getByTestId("progress-coach");
    await expect(coach).toContainText("Coach · Latest result");
    await expect(coach).toContainText("r improved in varied text");
    await expect(coach).toContainText("Transferred");
    await expect(coach).not.toContainText("Map your typing to find a stable Target");
    await expect(coach).toContainText("ranked by estimated worth");
    await expect(coach).toContainText(/~\d+\.\d+s \/ 1k chars/);
  });

  test("signed-in Progress displays the canonical net score without recalculating it", async ({ page }) => {
    const calls: { procedure: string; input: unknown }[] = [];
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      canonicalNetProgress: true,
      onProcedure: (procedure, input) => calls.push({ procedure, input }),
    });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:goal", JSON.stringify({ targetWpm: 100, targetDate: "2027-12-31" })));
    await gotoProgress(page);

    await expect(page.getByTestId("headline-current")).toContainText("80.0");
    await expect(page.getByRole("progressbar", { name: "Progress toward 100 WPM goal" })).toHaveAttribute("aria-valuenow", "80");
    await page.getByTestId("share-progress").click();
    await expect(page.getByTestId("share-progress")).toHaveText("Link copied");
    const shareCall = calls.find((call) => call.procedure === "scoreShare.createProgress");
    const points = (shareCall!.input as { snapshot: { points: Array<{ wpm: number }> } }).snapshot.points;
    expect(points.at(-1)!.wpm).toBe(80);
  });

  test("a signed-in user can share a progress card", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);
    await gotoProgress(page);

    const button = page.getByTestId("share-progress");
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveText("Link copied");
  });

  test("a shared progress card renders the delta and trend", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/score/progress-test-share");

    await expect(page.getByTestId("progress-share-card")).toBeVisible();
    await expect(page.getByTestId("progress-share-delta")).toContainText("+12.5");
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
  });

  test("a signed-out visitor with no history sees the sign-in pitch", async ({ page }) => {
    await gotoProgress(page);

    await expect(page.getByTestId("progress-signed-out")).toBeVisible();
    await expect(page.getByText("Your progress, kept forever")).toBeVisible();
    await page.getByRole("button", { name: "Sign in to track progress" }).click();
    await expect(page.locator("#signInModal")).toBeChecked();
    await expect(page.getByRole("button", { name: "Take a test first" })).toBeVisible();
  });

  test("a falling hero keeps its delta below the high side of the line", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { fallingProgress: true });
    await gotoProgress(page);

    await expect(page.getByTestId("headline-start-current").locator('[data-trend="down"]')).toBeVisible();
    await expect(page.getByTestId("headline-delta-value")).toHaveAttribute("data-placement", "below-high");
  });

  test("one practiced day builds a baseline; a second is not required on the same week", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify([
        { wpm: 100, accuracy: 90, t: Date.now() - 24 * 60 * 60 * 1000 },
      ]));
    });
    await gotoProgress(page);

    await expect(page.getByTestId("baseline-calibration")).toContainText("Building baseline");
    await expect(page.getByTestId("headline-delta-value")).toHaveAttribute("data-placement", "above-flat");
    await expect(page.getByTestId("headline-current")).toContainText("80.0");
  });

  test("a large current WPM stays inside the headline card on mobile", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "This guards the narrow-screen layout.");
    await page.addInitScript(() => {
      const day = 24 * 60 * 60 * 1000;
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify([
        { wpm: 1000, accuracy: 100, t: Date.now() - day },
        { wpm: 1129.2, accuracy: 100, t: Date.now() },
      ]));
    });
    await gotoProgress(page);

    const card = await page.getByTestId("headline-delta").boundingBox();
    const current = await page.getByTestId("headline-current").boundingBox();
    const viewport = page.viewportSize();
    expect(card).not.toBeNull();
    expect(current).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(current!.x + current!.width).toBeLessThanOrEqual(card!.x + card!.width);
    expect(card!.x + card!.width).toBeLessThanOrEqual(viewport!.width);
    expect(current!.x + current!.width).toBeLessThanOrEqual(viewport!.width);
  });

  test("a guest with local history gets the real dashboard plus a keep-it banner", async ({ page }) => {
    // Seed a rising local history (local-first: no account needed).
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const coachingHistory = progressCoachingHistory();
    await page.addInitScript(({ now, day, coachingHistory, coachingKey }) => {
      const entries = Array.from({ length: 12 }, (_, i) => ({ wpm: 55 + i * 1.5, accuracy: 95, t: now - (28 - i * 2.5) * day }));
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify(entries));
      window.localStorage.setItem(coachingKey, JSON.stringify(coachingHistory));
    }, { now, day, coachingHistory, coachingKey: `${DAILY_COACHING_STORAGE_KEY}:${encodeURIComponent(GUEST_DAILY_SCOPE)}` });

    await gotoProgress(page);

    await expect(page.getByTestId("guest-keep-banner")).toBeVisible();
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
    await expect(page.getByTestId("progress-coach")).toContainText("See whether your tion gain held");
    await expect(page.getByTestId("progress-signed-out")).toHaveCount(0);
  });

  test("guest progress history imports after sign in and renders from daily rollups", async ({ page }) => {
    const calls: { procedure: string; input: unknown }[] = [];
    await mockAuthenticatedSession(page);
    await mockTrpc(page, {
      emptyScores: true,
      onProcedure: (procedure, input) => {
        if (procedure === "test.syncProgressHistory") calls.push({ procedure, input });
      },
    });

    // Relative dates: fixed timestamps age out of the default 30-day window
    // and rot the test (this one broke exactly 30 days after it was written).
    await page.addInitScript(() => {
      const day = 24 * 60 * 60 * 1000;
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify([
        { wpm: 100, accuracy: 90, c: 72, t: Date.now() - 6 * day },
        { wpm: 68, accuracy: 96, c: 78, t: Date.now() - 4 * day },
      ]));
    });

    await gotoProgress(page);

    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe:progressHistory"))).toBeNull();
    expect(calls).toHaveLength(1);
    const importedEntries = (calls[0]!.input as { entries: Array<{ v: number; wpm: number }> }).entries;
    expect(importedEntries[0]).toMatchObject({ v: 2 });
    expect(importedEntries[0]!.wpm).toBe(80);
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
    await expect(page.getByText("No tests yet")).toHaveCount(0);
  });
});
