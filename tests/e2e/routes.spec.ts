import { expect, test } from "@playwright/test";
import { mockAuthenticatedSession } from "./helpers/trpc";

type PublicRoute =
  | { path: string; visibleText: string }
  | { path: string; selector: string }
  | { path: string; heading: string };

const publicRoutes: PublicRoute[] = [
  { path: "/", visibleText: "TypeCafe" },
  { path: "/train", selector: "#words .char" },
  { path: "/drill?keys=x", heading: "x" },
  { path: "/leaderboard", visibleText: "TypeCafe" },
  { path: "/support", heading: "Support TypeCafe" },
  { path: "/contact", heading: "Contact TypeCafe" },
  { path: "/privacy-policy", heading: "Privacy Policy for TypeCafe" },
  { path: "/terms-and-conditions", heading: "Terms and Conditions" },
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

    await expect(page.getByRole("button", { name: "Progress" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan" })).toHaveCount(0);
  });

  test("guests see Progress in the nav and reach the sign-in pitch", async ({ page }) => {
    await page.goto("/");

    const progress = page.getByRole("button", { name: "Progress" }).first();
    await expect(progress).toBeVisible();
    await expect(page.getByRole("button", { name: "Profile" })).toHaveCount(0);

    await progress.click();
    await expect(page.getByTestId("progress-signed-out")).toBeVisible();
  });
});
