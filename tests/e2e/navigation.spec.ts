import { expect, test } from "@playwright/test";

test.describe("app navigation", () => {
  test("routes through primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await page.getByRole("button", { name: "Learn" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Leaderboard" }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.locator("#leaderboard").first()).toBeVisible();

    await page.getByRole("button", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#words .char").first()).toBeVisible();
  });

  test("desktop secondary navigation reaches static routes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Secondary routes live in the desktop side navigation.");

    await page.goto("/");

    await page.getByRole("button", { name: "Support", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();

    await page.getByRole("button", { name: "Contact" }).click();
    await expect(page.getByRole("heading", { name: "Contact TypeCafe" })).toBeVisible();

    await page.getByRole("button", { name: "Privacy Policy" }).click();
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();

    await page.getByRole("button", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();
  });
});
