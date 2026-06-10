import { expect, test } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockTrpc } from "./helpers/trpc";

test.describe("public profile", () => {
  test.beforeEach(async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/profile/testuser");
  });

  test("renders public profile, stats, and best scores from mocked API data", async ({ page }) => {
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("Typing fast, testing faster.")).toBeVisible();
    await expect(page.getByText("https://typecafe.vercel.app")).toBeVisible();

    await expect(page.getByText("Time Typing")).toBeVisible();
    await expect(page.getByText("Words Typed")).toBeVisible();
    await expect(page.getByText("Top Speed")).toBeVisible();
    await expect(page.getByText("1st place")).toBeVisible();
    await expect(page.getByText("Best Scores")).toBeVisible();
    await expect(page.getByText("72.35")).toBeVisible();
  });

  test("switches best-score filters on the public profile", async ({ page }) => {
    await chooseReactSelectOption(page, "subModeSelect", "Words");
    await chooseReactSelectOption(page, "countSelect", "100");

    await expect(page.locator("#list").getByText("101.25", { exact: true })).toBeVisible();
  });
});
