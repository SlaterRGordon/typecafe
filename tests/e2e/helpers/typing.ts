import { expect, type Page } from "@playwright/test";

export async function typeCurrentCharacter(page: Page, index = 0) {
  const char = await page.locator(`#c${index}`).textContent();
  expect(char).not.toBeNull();

  if (char === " ") {
    await page.keyboard.press("Space");
    return;
  }

  await page.keyboard.press(char as string);
}

export async function typeVisibleTestText(page: Page) {
  const characters = await page.locator("#words .char").allTextContents();

  for (const char of characters) {
    if (char === " ") {
      await page.keyboard.press("Space");
    } else {
      await page.keyboard.press(char);
    }
  }
}
