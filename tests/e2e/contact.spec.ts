import { expect, test } from "@playwright/test";

test.describe("contact page", () => {
  // Suppress the desktop-only global support prompt so it can't overlay the
  // submit button (it has its own dedicated spec).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("typecafe.supportDismissedAt", Date.now().toString());
    });
  });

  test("browser validation blocks empty and invalid submissions", async ({ page }) => {
    let contactCalls = 0;
    await page.route("**/api/contact", async (route) => {
      contactCalls += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/contact");
    await page.getByRole("button", { name: "Send Message" }).click();

    expect(contactCalls).toBe(0);

    await page.getByPlaceholder("Your Name").fill("Slater");
    await page.getByPlaceholder("Your Email").fill("not-an-email");
    await page.getByPlaceholder("Your Message").fill("Hello from a validation test.");
    await page.getByRole("button", { name: "Send Message" }).click();

    expect(contactCalls).toBe(0);
  });

  test("successful submit clears the form and shows success", async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email sent successfully" }),
      });
    });

    await page.goto("/contact");
    await page.getByPlaceholder("Your Name").fill("Slater");
    await page.getByPlaceholder("Your Email").fill("slater@example.com");
    await page.getByPlaceholder("Your Message").fill("This should clear after submit.");
    await page.getByRole("button", { name: "Send Message" }).click();

    await expect(page.getByText("Message sent successfully!")).toBeVisible();
    await expect(page.getByPlaceholder("Your Name")).toHaveValue("");
    await expect(page.getByPlaceholder("Your Email")).toHaveValue("");
    await expect(page.getByPlaceholder("Your Message")).toHaveValue("");
  });

  test("failed submit keeps the user's message", async ({ page }) => {
    await page.route("**/api/contact", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Error sending email" }),
      });
    });

    await page.goto("/contact");
    await page.getByPlaceholder("Your Name").fill("Slater");
    await page.getByPlaceholder("Your Email").fill("slater@example.com");
    await page.getByPlaceholder("Your Message").fill("Please do not lose this.");
    await page.getByRole("button", { name: "Send Message" }).click();

    await expect(page.getByText("Error sending email")).toBeVisible();
    await expect(page.getByPlaceholder("Your Name")).toHaveValue("Slater");
    await expect(page.getByPlaceholder("Your Email")).toHaveValue("slater@example.com");
    await expect(page.getByPlaceholder("Your Message")).toHaveValue("Please do not lose this.");
  });
});
