import { expect, test } from "@playwright/test";
import { mockTrpc } from "./helpers/trpc";

test.describe("public profile", () => {
  test("shows a profile-shaped skeleton while loading", async ({ page }) => {
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
    await expect(page.getByTestId("profile-loading-skeleton")).toHaveAttribute("aria-busy", "true");

    releaseProfile();
    await expect(page.getByText("testuser").first()).toBeVisible();
  });

  test("renders public profile identity card, hero, stats, and training proof", async ({ page }) => {
    await mockTrpc(page);
    await page.goto("/profile/testuser");

    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.getByText("Typing fast, testing faster.")).toBeVisible();
    await expect(page.getByText("https://typecafe.vercel.app")).toBeVisible();

    // Hero: top speed + ranking.
    await expect(page.getByText("Top speed")).toBeVisible();
    await expect(page.getByText("1st place")).toBeVisible();
    await expect(page.getByTestId("profile-delta-chip")).toContainText("+4.2 WPM this month");

    // Secondary stats.
    await expect(page.getByText("minutes typed")).toBeVisible();
    await expect(page.getByText("Words typed")).toBeVisible();
    await expect(page.getByText("Tests this year")).toBeVisible();
    await expect(page.getByTestId("profile-activity-surface")).toBeVisible();
    await expect(page.getByTestId("profile-longest-streak")).toContainText("Longest streak: 5 days");
    await expect(page.getByTestId("profile-typing-style")).toContainText("Speed");
    await expect(page.getByTestId("profile-typing-style")).toContainText("84.6 WPM");
    await expect(page.getByTestId("profile-typing-style")).toContainText("97.4%");
    await expect(page.getByTestId("profile-typing-style")).toContainText("Momentum");
    await expect(page.getByTestId("profile-typing-style")).toContainText("Speed lift");
    await expect(page.getByTestId("profile-typing-style")).toContainText("+6.2 WPM");
    await expect(page.getByTestId("typing-style-chart")).toBeVisible();

    // Train progress: profile proof beyond raw top speed.
    const train = page.getByTestId("profile-train-progress");
    await expect(train.getByRole("heading", { name: "Train progress" })).toBeVisible();
    await expect(train.getByTestId("profile-train-link")).toHaveAttribute("href", "/train");
    await expect(train.getByText("32/100 levels")).toBeVisible();
    await expect(train.getByText("71/300 stars")).toBeVisible();
  });

  test("shows an honest not-found state instead of a ghost profile", async ({ page }) => {
    await mockTrpc(page, { missingProfile: true });
    await page.goto("/profile/missing-user");

    await expect(page.getByRole("heading", { name: "Profile not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse leaderboard" })).toHaveAttribute("href", "/leaderboard");
    await expect(page.getByText("Top speed")).toHaveCount(0);
  });

  test("shows a retryable failure state when the profile request fails", async ({ page }) => {
    await mockTrpc(page, { errorProcedures: ["user.getProfileByUsername"] });
    await page.goto("/profile/testuser");

    await expect(page.getByRole("heading", { name: "Profile unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByText("Top speed")).toHaveCount(0);
  });
});
