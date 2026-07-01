import { expect, test } from "@playwright/test";

test("kind tooltip shows on hover", async ({ page }, testInfo) => {
  await page.goto("/train");
  await expect(page.locator("#words .char").first()).toBeVisible({ timeout: 20_000 });
  const q = page.getByTestId("train-level-kind").getByLabel(/How Keys levels work/);
  await q.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath("tip.png") });
  console.log("SHOT", testInfo.outputPath("tip.png"));
});
