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
    await expect(page.getByRole("link", { name: "https://typecafe.app/contact" })).toHaveAttribute("href", "https://typecafe.app/contact");
    await expectNoHorizontalOverflow(page);

    await page.goto("/terms-and-conditions");
    await expect(page.getByRole("heading", { name: "Terms and Conditions", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://typecafe.app/contact" })).toHaveAttribute("href", "https://typecafe.app/contact");
    await expectNoHorizontalOverflow(page);
  });

  test("sitemap responds successfully", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.ok()).toBe(true);
    const xml = await response!.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("https://typecafe.app/guides");
    expect(xml).toContain("https://typecafe.app/how-we-measure");
    expect(xml).toContain("https://typecafe.app/stuck-at-60-70-wpm");
    expect(xml).toContain("https://typecafe.app/spacebar-slowing-down-typing");
    expect(xml).toContain("https://typecafe.app/slowest-key-transitions");
    expect(xml).toContain("https://typecafe.app/15-second-vs-60-second-wpm");
    expect(xml).toContain("https://typecafe.app/typing-consistency");
    expect(xml).not.toContain("[slug]");
    expect(xml).not.toContain("[username]");
  });

  test("ships site-wide Organization and WebSite structured data", async ({ page }) => {
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"url":"https://typecafe.app"');
  });

  test("positions the homepage as a measurable typing coach", async ({ page }) => {
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";

    await expect(page).toHaveTitle("TypeCafe - The Typing Coach That Makes You Faster");
    await expect(page.getByRole("heading", { name: "TypeCafe - the typing coach that makes you faster" })).toHaveCount(1);
    expect(html).toContain("diagnoses what slows your typing");
    expect(html).toContain("targeted drills");
    expect(html).toContain('"applicationCategory":"EducationalApplication"');

    const manifestResponse = await page.request.get("/manifest.json");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json() as { description?: string };
    expect(manifest.description).toContain("drill weak keys and transitions");
  });

  test("content pages self-canonicalize instead of pointing at the homepage", async ({ page }) => {
    const response = await page.goto("/how-to-type-faster");
    const html = (await response?.text()) ?? "";
    // Regression guard: a hardcoded root canonical made every page look like a
    // duplicate of home, so content pages couldn't rank (growth-seo §E).
    expect(html).toContain('rel="canonical" href="https://typecafe.app/how-to-type-faster"');
    await expect(page.getByRole("heading", { name: "How to Type Faster", exact: true })).toBeVisible();
  });

  test("new guides expose citable article, FAQ, and breadcrumb data", async ({ page }) => {
    const response = await page.goto("/slowest-key-transitions");
    const html = (await response?.text()) ?? "";
    expect(html).toContain('rel="canonical" href="https://typecafe.app/slowest-key-transitions"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    await expect(page.getByRole("link", { name: "Take a test to reveal your slowest transition" })).toHaveAttribute("href", "/");
  });
});
