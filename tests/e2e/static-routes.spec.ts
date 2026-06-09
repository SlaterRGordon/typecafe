import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasOverflow).toBe(false);
}

test.describe("secondary static routes", () => {
  test("support page exposes external support links", async ({ page }) => {
    await page.goto("/support");

    await expect(page.getByRole("heading", { name: "Support TypeCafe" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Buy Me A Coffee" })).toHaveAttribute("href", "https://www.buymeacoffee.com/typecafe");
    await expect(page.getByRole("link", { name: "Support my work" })).toHaveAttribute("href", "https://ko-fi.com/G2G519ZC63");
    await expectNoHorizontalOverflow(page);
  });

  test("privacy and terms pages expose contact links without horizontal overflow", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "Privacy Policy for TypeCafe" })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://typecafe.vercel.app/contact" })).toHaveAttribute("href", "https://typecafe.vercel.app/contact");
    await expectNoHorizontalOverflow(page);

    await page.goto("/terms-and-conditions");
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://typecafe.vercel.app/contact" })).toHaveAttribute("href", "https://typecafe.vercel.app/contact");
    await expectNoHorizontalOverflow(page);
  });

  test("sitemap responds successfully", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.ok()).toBe(true);
    await expect(page.locator("body")).toContainText("<urlset");
  });
});
