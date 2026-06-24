import { expect, test, type Locator, type Page } from "@playwright/test";
import { typeCurrentCharacter } from "./helpers/typing";

async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();
  await expect(page.locator("#c0")).toHaveClass(/active-char/);
}

async function closeCheckboxModal(modal: Locator) {
  await modal.evaluate((input) => {
    const checkbox = input as HTMLInputElement;
    if (checkbox.checked) {
      checkbox.click();
    }
  });
  await expect(modal).not.toBeChecked();
}

async function expectTypingIgnoredWhileModalOpen(page: Page, modal: Locator) {
  await expect(modal).toBeChecked();
  await typeCurrentCharacter(page);
  await expect(page.locator("#c0")).toHaveClass(/active-char/);
  await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
}

test.describe("modal focus behavior", () => {
  // Settings is now a non-modal toolbar dropdown (Phase 2). It no longer pauses
  // typing the way the old modal did; closing it must leave typing focus intact.
  test("settings dropdown closes on escape and typing resumes after", async ({ page }) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open typing settings']").click({ force: true });
    const menu = page.getByTestId("settings-menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/active-char/);
  });

  test("color modal pauses typing, persists a preset, and returns focus after closing", async ({ page }) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open color settings']").click({ force: true });
    const modal = page.locator("#colorModal");
    await expectTypingIgnoredWhileModalOpen(page, modal);

    await page.getByRole("button", { name: "Pastel" }).click();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("colors"))).toContain('"--p":"#d1c1d7"');

    await closeCheckboxModal(modal);
    await page.reload();
    await expect(page.locator("#words .char").first()).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("colors"))).toContain('"--p":"#d1c1d7"');

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
  });

  test("sign-in modal pauses typing", async ({ page }) => {
    await gotoHome(page);

    await page.locator("[aria-label='Open sign in']").click({ force: true });
    await expect(page.locator("#signInModal")).toBeChecked();
    await expect(page.getByText("Sign In", { exact: true }).first()).toBeVisible();

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });

  test("tab restart shortcut still works when modals are closed", async ({ page }) => {
    await gotoHome(page);

    await typeCurrentCharacter(page);
    await expect(page.locator("#c0")).toHaveClass(/text-base-300/);
    await expect(page.locator("#c1")).toHaveClass(/active-char/);

    await page.keyboard.down("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Tab");

    await expect(page.locator("#c0")).toHaveClass(/active-char/);
    await expect(page.locator("#c0")).not.toHaveClass(/text-base-300/);
  });
});
