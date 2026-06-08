import { expect, test } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

test.describe("authenticated profile", () => {
  test("redirects unauthenticated users home", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await mockTrpc(page);

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
  });

  test("renders authenticated profile and opens edit/delete modals", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/profile");

    await expect(page.getByText("testuser").first()).toBeVisible();
    await expect(page.locator("p").getByText("Typing fast, testing faster.")).toBeVisible();
    await expect(page.getByText("Best Scores")).toBeVisible();

    await chooseReactSelectOption(page, "subModeSelect", "Words");
    await chooseReactSelectOption(page, "countSelect", "100");
    await expect(page.locator("#list").getByText("101.25", { exact: true })).toBeVisible();

    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await expect(page.locator("#configModal")).toBeChecked();
    await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();

    await page.getByPlaceholder("Name", { exact: true }).fill("updateduser");
    await page.getByPlaceholder("Bio", { exact: true }).fill("Updated bio from Playwright.");
    await page.getByPlaceholder("Link", { exact: true }).fill("https://type.cafe/updated");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("#configModal")).not.toBeChecked();
    await expect(page.getByText("updateduser").first()).toBeVisible();
    await expect(page.locator("p").getByText("Updated bio from Playwright.")).toBeVisible();

    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await page.getByRole("button", { name: "Delete Profile" }).click();
    await expect(page.locator("#confirmModal")).toBeChecked();
    await expect(page.getByText("Are you sure you want to delete your account?")).toBeVisible();
    await page.getByRole("button", { name: "No" }).click();
    await expect(page.locator("#confirmModal")).not.toBeChecked();
  });
});
