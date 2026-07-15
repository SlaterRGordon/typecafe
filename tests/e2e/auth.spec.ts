import { expect, test, type Page } from "@playwright/test";
import { mockNextAuth } from "./helpers/auth";
import { mockTrpc } from "./helpers/trpc";
import { typeVisibleTestText } from "./helpers/typing";

async function openSignInModal(page: Page) {
  await page.goto("/");
  await expect(page.locator("#words .char").first()).toBeVisible();

  await page.locator("[aria-label='Open sign in']").click({ force: true });
  await expect(page.locator("#signInModal")).toBeChecked();
}

test.describe("auth modal", () => {
  test("closes after successful credential sign in and shows signed-in nav", async ({ page }) => {
    await mockNextAuth(page);
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.locator("[aria-label='Open sign in']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("submits credential sign in when pressing Enter in the form", async ({ page }) => {
    await mockNextAuth(page);
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.keyboard.press("Enter");

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("tabs from email to password on the sign-in form", async ({ page }) => {
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.keyboard.press("Tab");

    await expect(page.locator("#passwordInput")).toBeFocused();
  });

  test("keeps the modal open and shows an error after failed credential sign in", async ({ page }) => {
    await mockNextAuth(page, { loginSucceeds: false });
    await openSignInModal(page);

    await page.getByPlaceholder("Email").fill("test@example.com");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.locator("#signInModal")).toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
    await expect(page.locator("[aria-label='Open sign in']")).toBeVisible();
  });

  test("closes after successful sign up and automatic credential sign in", async ({ page }) => {
    await mockNextAuth(page);
    await mockTrpc(page);
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.locator("#usernamInput").fill("newuser");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("imports guest Timelines on sign up and retries only unconfirmed evidence", async ({ page }) => {
    const importCalls: Record<string, unknown>[][] = [];
    await mockNextAuth(page);
    await mockTrpc(page, {
      partialGuestEvidenceImport: true,
      onProcedure: (procedure, input) => {
        const tests: unknown = input?.tests;
        if (procedure === "test.importGuestEvidence" && Array.isArray(tests)) {
          importCalls.push(tests.filter((item): item is Record<string, unknown> => !!item && typeof item === "object"));
        }
      },
    });

    await page.goto("/?mode=words&count=10");
    await expect(page.locator("#words .char").first()).toBeVisible();
    await typeVisibleTestText(page);
    await expect.poll(() => page.evaluate(async () => {
      const request = indexedDB.open("typecafe", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("guestEvidenceTests")) request.result.createObjectStore("guestEvidenceTests", { keyPath: "localId" });
      };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Could not open guest evidence", { cause: request.error }));
      });
      const countRequest = database.transaction("guestEvidenceTests", "readonly").objectStore("guestEvidenceTests").count();
      const count = await new Promise<number>((resolve, reject) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(new Error("Could not count guest evidence", { cause: countRequest.error }));
      });
      database.close();
      return count;
    })).toBe(1);
    await page.evaluate(async () => {
      const request = indexedDB.open("typecafe", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("guestEvidenceTests")) request.result.createObjectStore("guestEvidenceTests", { keyPath: "localId" });
      };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Could not open guest evidence", { cause: request.error }));
      });
      const read = database.transaction("guestEvidenceTests", "readonly").objectStore("guestEvidenceTests").getAll();
      const [first] = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result as Array<Record<string, unknown>>);
        read.onerror = () => reject(new Error("Could not read guest evidence", { cause: read.error }));
      });
      if (first) {
        const write = database.transaction("guestEvidenceTests", "readwrite");
        write.objectStore("guestEvidenceTests").put({ ...first, localId: `${String(first.localId)}-retry` });
        await new Promise<void>((resolve, reject) => {
          write.oncomplete = () => resolve();
          write.onerror = () => reject(new Error("Could not duplicate guest evidence", { cause: write.error }));
        });
      }
      database.close();
    });

    await page.locator("[aria-label='Open sign in']").click({ force: true });
    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.locator("#usernamInput").fill("newuser");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect.poll(() => importCalls.length).toBe(2);
    expect(importCalls[0]).toHaveLength(2);
    expect(importCalls[1]).toHaveLength(1);
    expect(importCalls[0]![0]).toMatchObject({
      context: "natural",
      config: { mode: 0, subMode: 1, count: 10, layout: "qwerty", language: "english" },
    });
    await expect.poll(() => page.evaluate(async () => {
      const request = indexedDB.open("typecafe", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("guestEvidenceTests")) request.result.createObjectStore("guestEvidenceTests", { keyPath: "localId" });
      };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Could not open guest evidence", { cause: request.error }));
      });
      const countRequest = database.transaction("guestEvidenceTests", "readonly").objectStore("guestEvidenceTests").count();
      const count = await new Promise<number>((resolve, reject) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(new Error("Could not count guest evidence", { cause: countRequest.error }));
      });
      database.close();
      return count;
    })).toBe(0);
  });

  test("submits sign up when pressing Enter in the form", async ({ page }) => {
    await mockNextAuth(page);
    await mockTrpc(page);
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.locator("#usernamInput").fill("newuser");
    await page.getByPlaceholder("Password").fill("Password1");
    await page.keyboard.press("Enter");

    await expect(page.locator("#signInModal")).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("tabs through email, username, and password on the sign-up form", async ({ page }) => {
    await openSignInModal(page);

    await page.getByRole("button", { name: "New to TypeCafe? Join Now" }).click();
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.keyboard.press("Tab");
    await expect(page.locator("#usernamInput")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator("#passwordInput")).toBeFocused();
  });
});
