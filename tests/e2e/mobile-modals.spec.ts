import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

// iPhone SE-sized viewport — the smallest screen we support.
test.use({ viewport: { width: 375, height: 667 } });

async function expectModalFits(page: Page, box: Locator) {
  await expect(box).toBeVisible();
  const bounds = await box.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (bounds && viewport) {
    // The modal box never exceeds the viewport height and stays fully on-screen
    // (1px tolerance for sub-pixel rounding / borders).
    expect(bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.y).toBeGreaterThanOrEqual(-1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

const boxFor = (page: Page, heading: string) =>
  page.locator(".modal-box").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

test.describe("modals fit on a small mobile viewport", () => {
  test("settings modal fits the screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();

    await page.locator("[aria-label='Open typing settings']").click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expectModalFits(page, boxFor(page, "Settings"));
  });

  test("colors modal fits and the pinned Save action stays in view", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();

    await page.locator("[aria-label='Open color settings']").click();
    await expect(page.getByRole("heading", { name: "Colors" })).toBeVisible();
    await expectModalFits(page, boxFor(page, "Colors"));

    // Custom tab: the swatches stack and the pinned Save Color stays on-screen.
    await page.getByRole("button", { name: "Custom" }).click();
    await expect(page.getByRole("button", { name: "Save Color" })).toBeInViewport();
  });

  test("profile edit modal fits the screen", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/profile");
    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
    await expectModalFits(page, boxFor(page, "Edit Profile"));
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeInViewport();
  });
});
