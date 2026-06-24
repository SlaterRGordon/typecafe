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

// Press a key guaranteed NOT to match the character at `index`, registering an
// incorrect keystroke. Used to drive live-accuracy assertions deterministically.
export async function typeWrongCharacter(page: Page, index = 0) {
  const char = await page.locator(`#c${index}`).textContent();
  expect(char).not.toBeNull();

  const wrongKey = char === "a" ? "b" : "a";
  await page.keyboard.press(wrongKey);
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
