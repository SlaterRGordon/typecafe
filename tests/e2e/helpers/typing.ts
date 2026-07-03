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

async function pressChar(page: Page, char: string) {
  if (char === " ") await page.keyboard.press("Space");
  else await page.keyboard.press(char);
}

export async function typeVisibleTestText(page: Page) {
  // Wait for the test to be ready (first char active) before reading the text —
  // a just-triggered restart may still be regenerating it.
  await expect(page.locator("#c0")).toHaveClass(/active-char/);
  const characters = await page.locator("#words .char").allTextContents();
  const [first, ...rest] = characters;
  if (first === undefined) return;

  // The typer drops keystrokes for a brief window around a restart; press the
  // first character until it registers (the active char advances), then type
  // the rest. (Callers only need completion — none count exact keystrokes.)
  await expect(async () => {
    await pressChar(page, first);
    await expect(page.locator("#c0")).not.toHaveClass(/active-char/, { timeout: 500 });
  }).toPass({ timeout: 5_000 });
  for (const char of rest) await pressChar(page, char);
}
