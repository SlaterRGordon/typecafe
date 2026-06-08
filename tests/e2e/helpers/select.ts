import { expect, type Page } from "@playwright/test";

export async function chooseReactSelectOption(page: Page, instanceId: string, option: string) {
  const input = page.locator(`#react-select-${instanceId}-input`);
  const control = input.locator("xpath=ancestor::*[contains(@class, 'my-react-select__control')][1]");

  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(input).toBeAttached();
}
