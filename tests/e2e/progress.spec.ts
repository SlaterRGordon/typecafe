import { expect, test, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

async function gotoProgress(page: Page) {
  await page.goto("/progress");
}

test.describe("progress dashboard", () => {
  test("a signed-in user with history sees their delta and trend", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page, { keyStats: [{ character: "r", total: 120, correct: 96 }, { character: "e", total: 300, correct: 290 }] });
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

    // Stat cells summarise the selected period.
    await expect(page.getByText("Avg WPM")).toBeVisible();
    await expect(page.getByText("Best WPM")).toBeVisible();

    // Accuracy trend (second chart) and the records timeline render too.
    await expect(page.getByTestId("trend-chart")).toHaveCount(2);
    await expect(page.getByTestId("records-timeline")).toBeVisible();
    await expect(page.getByTestId("lifetime-heatmap")).toBeVisible();
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
