import { expect, test } from "@playwright/test"

test("the retired plan route is unavailable", async ({ page }) => {
  const response = await page.goto("/plan")

  expect(response?.status()).toBe(404)
  await expect(page).toHaveURL(/\/plan$/)
})
