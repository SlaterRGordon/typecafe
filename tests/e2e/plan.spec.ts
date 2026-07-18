import { expect, test } from "@playwright/test"

test("legacy daily-plan links return to target-first Progress", async ({ page }) => {
  await page.goto("/plan")

  await expect(page).toHaveURL(/\/progress$/)
})
