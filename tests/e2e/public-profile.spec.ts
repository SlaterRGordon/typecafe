import { expect, test } from "@playwright/test";
import { mockTrpc } from "./helpers/trpc";

test.describe("public profile", () => {
  test.beforeEach(async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/profile/testuser");
  });

  test("renders public profile identity card, hero, stats, and signature bests", async ({ page }) => {
    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("Typing fast, testing faster.")).toBeVisible();
    await expect(page.getByText("https://typecafe.vercel.app")).toBeVisible();

    // Hero: top speed + ranking.
    await expect(page.getByText("Top Speed")).toBeVisible();
    await expect(page.getByText("1st place")).toBeVisible();

    // Secondary stats.
    await expect(page.getByText("Time Typing")).toBeVisible();
    await expect(page.getByText("Words Typed")).toBeVisible();

    // Signature best cards, one per common config.
    await expect(page.getByRole("heading", { name: "Best Scores" })).toBeVisible();
    const bests = page.getByTestId("signature-bests");
    await expect(bests.getByText("15 seconds")).toBeVisible();
    await expect(bests.getByText("60 seconds")).toBeVisible();
    await expect(bests.getByText("100 words")).toBeVisible();
    await expect(bests.getByText("72.3")).toBeVisible();
    await expect(bests.getByText("101.2")).toBeVisible();
  });
});
