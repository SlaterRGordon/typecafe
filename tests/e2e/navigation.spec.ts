import { expect, test } from "@playwright/test";

test.describe("app navigation", () => {
  test("orders primary navigation around the improvement loop", async ({ page }, testInfo) => {
    await page.goto("/");

    const nav = testInfo.project.name.includes("mobile")
      ? page.getByTestId("bottom-primary-nav")
      : page.getByTestId("side-primary-nav");

    await expect(nav).toBeVisible();
    const labels = await nav.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")).filter(Boolean)
    );
    const icons = await nav.locator(".material-symbols-rounded").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim()).filter(Boolean)
    );

    expect(labels.slice(0, 5)).toEqual(["Home", "Train", "Progress", "Daily Challenge", "Leaderboard"]);
    expect(icons.slice(0, 5)).toEqual(["home", "fitness_center", "trending_up", "calendar_today", "leaderboard"]);
    await expect(nav.locator(".fa-dumbbell")).toHaveCount(0);
  });

  test("routes through primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await page.getByRole("button", { name: "Train" }).click();
    await expect(page).toHaveURL(/\/train$/);
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Leaderboard" }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.locator("#leaderboard").first()).toBeVisible();

    await page.getByRole("button", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#words .char").first()).toBeVisible();
  });

  test("desktop secondary navigation reaches static routes via the More menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Secondary routes live in the desktop side navigation.");

    await page.goto("/");

    const menu = page.getByTestId("nav-more-menu");
    const openMore = async () => {
      await page.getByTestId("nav-more").click();
      await expect(menu).toBeVisible();
    };

    // The five footer links now live behind one "More" popover.
    await openMore();
    await menu.getByRole("button", { name: "Support Me" }).click();
    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await expect(menu).toBeHidden();

    await openMore();
    await menu.getByRole("button", { name: "Contact Us" }).click();
    await expect(page.getByRole("heading", { name: "Contact TypeCafe" })).toBeVisible();

    await openMore();
    await menu.getByRole("button", { name: "Privacy Policy" }).click();
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();

    await openMore();
    await menu.getByRole("button", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();

    await openMore();
    await menu.getByRole("button", { name: "How we measure" }).click();
    await expect(page).toHaveURL(/\/how-we-measure$/);
  });
});
