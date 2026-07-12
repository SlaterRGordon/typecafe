import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

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
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
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

  test("a signed-in user with history sees their delta, trends, and weak spots", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 120, correct: 96 }, { character: "e", total: 300, correct: 290 }] });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await gotoProgress(page);

    // The headline delta is the largest number on the page and answers
    // "am I getting faster?" - the mocked history rises, so it's positive.
    const headline = page.getByTestId("headline-delta");
    await expect(headline).toBeVisible();
    await expect(headline.getByText(/\+\d/)).toBeVisible();
    await expect(headline.getByText("WPM").first()).toBeVisible();
    await expect(page.getByTestId("headline-start-current")).toContainText("Start");
    await expect(page.getByTestId("headline-start-current")).toContainText("Current");

    // The practice streak chip shows (the mocked history reaches today).
    await expect(page.getByTestId("streak-chip")).toBeVisible();

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
    const trendTabs = page.getByTestId("trend-tabs");
    await trendTabs.getByRole("button", { name: "Accuracy" }).click();
    await expect(page.getByText("Accuracy over time", { exact: true })).toBeVisible();
    await page.getByTestId("trend-point-0").hover();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Accuracy");
    await trendTabs.getByRole("button", { name: "Consistency" }).click();
    await expect(page.getByText("Consistency over time", { exact: true })).toBeVisible();
    await page.getByTestId("trend-point-0").hover();
    await expect(page.getByTestId("trend-tooltip")).toContainText("Consistency");
    await trendTabs.getByRole("button", { name: "WPM" }).click();
    await expect(page.getByText("WPM over time", { exact: true })).toBeVisible();
    await page.getByTestId("period-switcher").getByRole("button", { name: "7d" }).click();
    await expect(page.getByText("Daily best trend", { exact: true })).toBeVisible();

    // Best WPM is a header chip now (the rest of the stat cells are gone).
    await expect(page.getByTestId("best-wpm-chip")).toContainText("Best");

    // Weak spots → drill (§6.4): top weak keys + slowest transitions, each → /drill.
    const weak = page.getByTestId("weak-spots");
    await expect(weak).toBeVisible();
    // r (80%) is weaker than e (96.7%), so it leads the weakest-keys CTA - the
    // keys show as chips above the button; the button just carries the action,
    // and the drill href preserves their order.
    const drillWeak = weak.getByRole("link", { name: /Drill weakest keys/ });
    await expect(drillWeak).toBeVisible();
    await expect(drillWeak).toHaveAttribute("href", /keys=r,e/);
    await expect(page.getByTestId("lifetime-keyboard-card")).toContainText("Your keyboard");
    await expect(page.getByTestId("lifetime-keyboard-card")).toContainText("Lower accuracy");
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
    await expect(page.getByTestId("lifetime-heatmap")).toContainText("80%");
    // The heatmap flips layers: shift renders each cell's shifted twin with its
    // own tally (1 → !), and flipping back restores the base glyphs.
    const heatmap = page.getByTestId("lifetime-heatmap");
    await expect(heatmap.locator('[data-kb-key="1"]')).toBeVisible();
    const shiftLayerButton = page.getByTestId("lifetime-heatmap-layers").getByRole("button", { name: "⇧ shift" });
    await shiftLayerButton.click();
    await expect(heatmap.locator('[data-kb-key="!"]')).toBeVisible();
    await expect(heatmap.locator('[data-kb-key="R"]')).toBeVisible();
    await shiftLayerButton.click();
    await expect(heatmap.locator('[data-kb-key="1"]')).toBeVisible();
    const transitions = page.getByTestId("worst-transitions");
    await expect(transitions).toContainText("b→r");
    await expect(transitions.getByRole("link", { name: "Drill br" })).toBeVisible();

    // The records timeline still anchors the bottom of the story.
    await expect(page.getByTestId("records-timeline")).toBeVisible();

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
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
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
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
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
    await expect(page.getByTestId("goal-status")).toContainText("WPM/week");
  });

  test("a flat trend shows the plateau coach voice", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { flatProgress: true });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await gotoProgress(page);

    const plateau = page.getByTestId("plateau-headline");
    await expect(plateau).toBeVisible();
    await expect(plateau).toContainText("Plateaued for");
    await expect(plateau).toContainText("Switch to transition drills to break the ceiling.");
    await expect(plateau.getByRole("link", { name: "Try transition drills" })).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: "Take a test first" })).toBeVisible();
  });

  test("a guest with local history gets the real dashboard plus a keep-it banner", async ({ page }) => {
    // Seed a rising local history (local-first: no account needed).
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await page.addInitScript(({ now, day }) => {
      const entries = Array.from({ length: 12 }, (_, i) => ({ wpm: 55 + i * 1.5, accuracy: 95, t: now - (28 - i * 2.5) * day }));
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify(entries));
    }, { now, day });

    await gotoProgress(page);

    await expect(page.getByTestId("guest-keep-banner")).toBeVisible();
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
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
      window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now()));
      window.localStorage.setItem("typecafe:progressHistory", JSON.stringify([
        { wpm: 62, accuracy: 94, c: 72, t: Date.now() - 6 * day },
        { wpm: 68, accuracy: 96, c: 78, t: Date.now() - 4 * day },
      ]));
    });

    await gotoProgress(page);

    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("typecafe:progressHistory"))).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ wpm: 62 })]) });
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();
    await expect(page.getByText("No tests yet")).toHaveCount(0);
  });
});
