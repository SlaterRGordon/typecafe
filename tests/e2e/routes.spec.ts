import { expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/", visibleText: "TypeCafe" },
  { path: "/learn", selector: "#words .char" },
  { path: "/leaderboard", visibleText: "TypeCafe" },
  { path: "/support", heading: "Support TypeCafe" },
  { path: "/contact", heading: "Contact Us" },
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
});
