import { expect, test } from "@playwright/test";

test.describe("app navigation", () => {
  test("mobile global controls fit the viewport and meet touch targets", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile navigation geometry only.");
    await page.goto("/");

    const nav = page.getByTestId("top-navigation");
    await expect(nav).toBeVisible();
    expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const testId of ["nav-language-trigger", "nav-layout-trigger", "nav-color-trigger", "nav-auth-trigger"]) {
      const control = page.getByTestId(testId);
      const box = await control.boundingBox();
      expect(box, `${testId} should have a rendered box`).not.toBeNull();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    }

    await expect(page.getByTestId("nav-language-trigger")).toHaveRole("button");
    await expect(page.getByTestId("nav-layout-trigger")).toHaveRole("button");
  });

  test("orders primary navigation around the improvement loop", async ({ page }, testInfo) => {
    await page.goto("/");

    const nav = testInfo.project.name.includes("mobile")
      ? page.getByTestId("bottom-primary-nav")
      : page.getByTestId("side-primary-nav");

    await expect(nav).toBeVisible();
    const labels = await nav.getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("aria-label")).filter(Boolean)
    );
    const icons = await nav.locator(".material-symbols-rounded").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim()).filter(Boolean)
    );

    // Daily Challenge is hidden for now (2026-07) - no /challenge entry point.
    // Today's coaching sits right after Home: the returning user's front door.
    expect(labels.slice(0, 5)).toEqual(["Home", "Today's coaching", "Train", "Progress", "Leaderboard"]);
    expect(icons.slice(0, 5)).toEqual(["home", "today", "fitness_center", "trending_up", "leaderboard"]);
    expect(labels).not.toContain("Daily Challenge");
    await expect(nav.locator(".fa-dumbbell")).toHaveCount(0);
  });

  test("routes through primary navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#words .char").first()).toBeVisible();

    await page.getByRole("link", { name: "Train" }).click();
    await expect(page).toHaveURL(/\/train$/);
    // /train lands on the level map hub.
    await expect(page.getByTestId("train-continue")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("link", { name: "Leaderboard" }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.locator("#leaderboard").first()).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
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

    // The footer links now live behind one "More" popover; guide articles sit
    // behind the single /guides hub entry.
    await openMore();
    await menu.getByRole("link", { name: "Guides" }).click();
    await expect(page.getByRole("heading", { name: "Typing Guides" })).toBeVisible();
    await expect(menu).toBeHidden();

    await openMore();
    await menu.getByRole("link", { name: "Support Me" }).click();
    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await expect(menu).toBeHidden();

    await openMore();
    await menu.getByRole("link", { name: "Contact Us" }).click();
    await expect(page.getByRole("heading", { name: "Contact TypeCafe" })).toBeVisible();

    await openMore();
    await menu.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();

    await openMore();
    await menu.getByRole("link", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();

    await openMore();
    await menu.getByRole("link", { name: "How we measure" }).click();
    await expect(page).toHaveURL(/\/how-we-measure$/);
  });
});
