import { expect, test } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockTrpc } from "./helpers/trpc";

test.describe("leaderboard filters", () => {
  test.beforeEach(async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/leaderboard");
    await expect(page.getByText("testuser")).toBeVisible();
  });

  test("renders mocked scores and switches timed counts", async ({ page }, testInfo) => {
    await expect(page.getByText("72.35")).toBeVisible();
    if (!testInfo.project.name.includes("mobile")) {
      await expect(page.getByText("96.50 %")).toBeVisible();
    }

    await chooseReactSelectOption(page, "countSelect", "120");

    await expect(page.getByText("101.25")).toBeVisible();
  });

  test("switches words mode and exposes word-count options", async ({ page }) => {
    await chooseReactSelectOption(page, "subModeSelect", "Words");

    await expect(page.getByText("10").first()).toBeVisible();
    await chooseReactSelectOption(page, "countSelect", "25");

    await expect(page.getByText("88.50")).toBeVisible();
  });

  test("supports language and date-range filters without losing results", async ({ page }) => {
    await chooseReactSelectOption(page, "languageSeelect", "French");
    await chooseReactSelectOption(page, "timeRangeSelect", "Weekly");

    await expect(page.getByText("testuser")).toBeVisible();
  });
});
