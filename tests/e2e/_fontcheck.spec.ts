import { expect, test } from "@playwright/test";

test("inspect typer font", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();
  const info = await page.evaluate(() => {
    const words = document.getElementById("words")!;
    return {
      fontVar: getComputedStyle(document.documentElement).getPropertyValue("--font-mono"),
      wordsFont: getComputedStyle(words).fontFamily,
    };
  });
  console.log("FONTCHECK", JSON.stringify(info));
});
