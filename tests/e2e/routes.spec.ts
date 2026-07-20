import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession } from "./helpers/trpc";

type PublicRoute =
  | { path: string; visibleText: string }
  | { path: string; selector: string }
  | { path: string; heading: string };

const publicRoutes: PublicRoute[] = [
  { path: "/", visibleText: "TypeCafe" },
  { path: "/practice", heading: "Practice with a purpose." },
  // /train lands on the level map hub.
  { path: "/train", selector: "[data-testid='train-map-grid']" },
  { path: "/leaderboard", visibleText: "TypeCafe" },
  { path: "/support", heading: "Support TypeCafe" },
  { path: "/contact", heading: "Contact TypeCafe" },
  { path: "/privacy-policy", heading: "Privacy Policy for TypeCafe" },
  { path: "/terms-and-conditions", heading: "Terms and Conditions" },
  { path: "/guides", heading: "Typing Guides" },
  { path: "/how-to-type-faster", heading: "How to Type Faster" },
  { path: "/how-ngrams-work", heading: "How N-grams Work" },
  { path: "/keyboard-layouts", heading: "Keyboard Layouts Explained" },
  { path: "/stuck-at-60-70-wpm", heading: "Stuck at 60–70 WPM?" },
  { path: "/spacebar-slowing-down-typing", heading: "Is Your Spacebar Slowing You Down?" },
  { path: "/slowest-key-transitions", heading: "Find Your Slowest Key Transitions" },
  { path: "/15-second-vs-60-second-wpm", heading: "15-Second vs. 60-Second WPM" },
  { path: "/typing-consistency", heading: "What Typing Consistency Actually Means" },
];

test.describe("public routes", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);

      if ("heading" in route) {
        await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
      } else if ("selector" in route) {
        await expect(page.locator(route.selector).first()).toBeVisible({ timeout: 20_000 });
      } else {
        await expect(page.getByText(route.visibleText, { exact: false }).first()).toBeVisible();
      }
    });
  }

  test("launch navigation hides plan for signed-in users", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Progress" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan" })).toHaveCount(0);
  });

  test("guests see Progress in the nav and reach the sign-in pitch", async ({ page }) => {
    await page.goto("/");

    const progress = page.getByRole("link", { name: "Progress" }).first();
    await expect(progress).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);

    await progress.click();
    await expect(page.getByTestId("progress-signed-out")).toBeVisible();
  });
});
