import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

async function gotoProgress(page: Page) {
  await page.goto("/progress");
}

test.describe("progress dashboard", () => {
  test("a signed-in user with history sees their delta and trend", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 120, correct: 96 }, { character: "e", total: 300, correct: 290 }] });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now())));
    await gotoProgress(page);

    // The headline delta is the largest number on the page and answers
    // "am I getting faster?" — the mocked history rises, so it's positive.
    const headline = page.getByTestId("headline-delta");
    await expect(headline).toBeVisible();
    await expect(headline.getByText(/\+\d/)).toBeVisible();
    await expect(headline.getByText("WPM").first()).toBeVisible();

    // The trend chart renders over the same data.
    await expect(page.getByTestId("trend-chart").first()).toBeVisible();

    // The practice streak chip shows (the mocked history reaches today).
    await expect(page.getByTestId("streak-chip")).toBeVisible();

    // Phase 5.3 self-league: one-user improvement competition until cohorts are real.
    const selfLeague = page.getByTestId("self-league-card");
    await expect(selfLeague).toBeVisible();
    await expect(selfLeague).toContainText("Self league");
    await expect(selfLeague).toContainText("1-user league");
    await expect(page.getByTestId("self-league-delta")).toContainText(/\+\d/);

    // Stat cells summarise the selected period.
    await expect(page.getByText("Avg WPM")).toBeVisible();
    await expect(page.getByText("Best WPM")).toBeVisible();

    // WPM + accuracy + consistency trends, and the records timeline.
    await expect(page.getByTestId("trend-chart")).toHaveCount(3);
    await expect(page.getByText("Consistency over time", { exact: true })).toBeVisible();
    await expect(page.getByText("Avg consistency")).toBeVisible();
    await expect(page.getByTestId("records-timeline")).toBeVisible();
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
    // Coach stance (§4.3) reads from recent accuracy/consistency/trend.
    await expect(page.getByTestId("stance")).toBeVisible();
    // Worst transitions (§4.1) — the slowest key pairs, each with a drill button.
    const transitions = page.getByTestId("worst-transitions");
    await expect(transitions).toBeVisible();
    await expect(transitions).toContainText("b→r");
    await expect(transitions.getByRole("link", { name: "Drill br" })).toBeVisible();
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

    const goal = page.getByTestId("goal-card");
    await expect(goal).toBeVisible();
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
    await expect(plateau.getByRole("link", { name: "Try transition drills" })).toBeVisible();
  });

  test("the weekly recap opens after a week and dismisses", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "b", total: 60, correct: 40 }] });
    await page.addInitScript(() => window.localStorage.setItem("typecafe:lastRecapAt", String(Date.now() - 8 * 24 * 60 * 60 * 1000)));
    await gotoProgress(page);

    const recap = page.getByTestId("weekly-recap");
    await expect(recap).toBeVisible();
    // States the diagnosis (which key + why), then the drill button.
    await expect(recap).toContainText("Your weakest key is B");
    await expect(recap).toContainText("67%"); // 40/60 correct
    await expect(recap.getByRole("link", { name: "Drill B" })).toBeVisible();

    await recap.getByRole("button", { name: "Dismiss recap" }).click();
    await expect(recap).toBeHidden();
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
});
