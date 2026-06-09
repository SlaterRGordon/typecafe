import { expect, test, type Page } from "@playwright/test";
import { mockNextAuth } from "./helpers/auth";
import { mockTrpc } from "./helpers/trpc";

async function openSignInModal(page: Page) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();

  await page.locator("[aria-label='Open sign in']").click({ force: true });
  await expect(page.locator("#signInModal")).toBeChecked();
}

test.describe("auth modal", () => {
  test("closes after successful credential sign in and shows signed-in nav", async ({ page }) => {
    await mockNextAuth(page);
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.locator("[aria-label='Open sign in']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("submits credential sign in when pressing Enter in the form", async ({ page }) => {
    await mockNextAuth(page);
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.keyboard.press("Enter");

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("tabs from email to password on the sign-in form", async ({ page }) => {
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.keyboard.press("Tab");

    await expect(page.locator("#passwordInput")).toBeFocused();
  });

  test("keeps the modal open and shows an error after failed credential sign in", async ({ page }) => {
    await mockNextAuth(page, { loginSucceeds: false });
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.locator("#signInModal")).toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
    await expect(page.locator("[aria-label='Open sign in']")).toBeVisible();
  });

  test("closes after successful sign up and automatic credential sign in", async ({ page }) => {
    await mockNextAuth(page);
    await mockTrpc(page);
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.locator("#usernamInput").fill("newuser");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("submits sign up when pressing Enter in the form", async ({ page }) => {
    await mockNextAuth(page);
    await mockTrpc(page);
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.locator("#usernamInput").fill("newuser");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.keyboard.press("Enter");

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("tabs through email, username, and password on the sign-up form", async ({ page }) => {
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.keyboard.press("Tab");
    await expect(page.locator("#usernamInput")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("#passwordInput")).toBeFocused();
  });
});
