import { expect, test } from "@playwright/test";
import { chooseReactSelectOption } from "./helpers/select";
import { mockAuthenticatedSession, mockTrpc } from "./helpers/trpc";

test.describe("authenticated profile", () => {
  const blobAvatarUrl = "https://typecafe-test.public.blob.vercel-storage.com/avatars/user-1/avatar.webp";

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

  test("removes an existing custom profile picture", async ({ page }) => {
    await mockAuthenticatedSession(page, blobAvatarUrl);
    await mockTrpc(page, { profileImage: blobAvatarUrl });

    await page.goto("/profile");

    await expect(page.locator("#main").getByAltText("Profile Picture", { exact: true })).toBeVisible();

    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await expect(page.getByAltText("Profile picture preview")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.locator("#configModal")).not.toBeChecked();
    await expect(page.locator("#main").getByAltText("Profile Picture", { exact: true })).toHaveCount(0);
    await expect(page.locator(".avatar").getByText("T").first()).toBeVisible();
  });

  test("rejects unsupported profile picture files before upload", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/profile");
    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await page.setInputFiles("#avatarInput", {
      name: "avatar.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });

    await expect(page.getByRole("alert").filter({ hasText: "Profile picture must be a JPG" })).toContainText("Profile picture must be a JPG, PNG, or WebP image.");
  });

  test("opens the cropper for supported profile picture files", async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockTrpc(page);

    await page.goto("/profile");
    await page.locator("label[for='configModal']").filter({ hasText: /^Edit Profile$/ }).click();
    await page.setInputFiles("#avatarInput", {
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSFIAI9kH+f6mO1EAAAAASUVORK5CYII=",
        "base64",
      ),
    });

    await expect(page.getByRole("heading", { name: "Crop Photo" })).toBeVisible();
    await page.getByRole("slider").fill("2");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Crop Photo" })).toHaveCount(0);
  });
});
