import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

// iPhone SE-sized viewport - the smallest screen we support.
test.use({ viewport: { width: 375, height: 667 } });

async function expectModalFits(page: Page, box: Locator) {
  await expect(box).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  // Poll the bottom edge so the open/slide-in animation settles before asserting
  // (the box transitions up from below; measuring too early catches it mid-slide).
  await expect.poll(async () => {
    const b = await box.boundingBox();
    return b ? Math.round(b.y + b.height) : Infinity;
  }, { timeout: 5000 }).toBeLessThanOrEqual(viewport.height + 1);

  const bounds = await box.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    // The settled box never exceeds the viewport height and stays fully on-screen.
    expect(bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.y).toBeGreaterThanOrEqual(-1);
  }
}

const boxFor = (page: Page, heading: string) =>
  page.locator(".modal-box").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

test.describe("modals fit on a small mobile viewport", () => {
  test("settings dropdown fits the screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();

    // Settings moved from a modal to a toolbar dropdown; it must still fit the
    // smallest viewport without overflowing off-screen.
    await page.locator("[aria-label='Open typing settings']").click();
    const settingsMenu = page.getByTestId("settings-menu");
    await expect(settingsMenu).toBeVisible();
    await expectModalFits(page, settingsMenu);
  });

  test("colors modal fits and the pinned Save action stays in view", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/");
    await expect(page.locator("#typer")).toBeVisible();

    await page.locator("[aria-label='Open color settings']").click();
    await expect(page.getByRole("heading", { name: "Colors" })).toBeVisible();
    const colorsBox = boxFor(page, "Colors");
    await expectModalFits(page, colorsBox);

    // Custom tab: the swatches stack and the pinned Save Color stays on-screen.
    // Scope to the modal box - the toolbar now has its own "Custom" length button.
    await colorsBox.getByRole("button", { name: "Custom" }).click();
    await expect(colorsBox.getByRole("button", { name: "Save Color" })).toBeInViewport();
  });

  test("profile edit modal fits the screen", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/profile");
    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
    await expectModalFits(page, boxFor(page, "Edit Profile"));
    // Save Changes sits at the end of the scrollable form; confirm it's reachable.
    await page.getByRole("button", { name: "Save Changes" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Save Changes" })).toBeInViewport();
  });
});
