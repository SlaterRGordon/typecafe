import type { Page, Route } from "@playwright/test";

interface MockNextAuthOptions {
  loginSucceeds?: boolean;
}

const authUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  username: "testuser",
  image: null,
};

export async function mockNextAuth(page: Page, options: MockNextAuthOptions = {}) {
  let authenticated = false;
  const loginSucceeds = options.loginSucceeds ?? true;

  await page.route("**/api/auth/providers", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        login: {
          id: "login",
          name: "Credentials",
          type: "credentials",
          signinUrl: "/api/auth/signin/login",
          callbackUrl: "/api/auth/callback/login",
        },
        google: {
          id: "google",
          name: "Google",
          type: "oauth",
          signinUrl: "/api/auth/signin/google",
          callbackUrl: "/api/auth/callback/google",
        },
      }),
    });
  });

  await page.route("**/api/auth/csrf", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "mock-csrf-token" }),
    });
  });

  await page.route("**/api/auth/session", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        authenticated
          ? {
              user: authUser,
              expires: "2099-01-01T00:00:00.000Z",
            }
          : {},
      ),
    });
  });

  await page.route("**/api/auth/callback/login", async (route: Route) => {
    const requestUrl = new URL(route.request().url());
    const successUrl = new URL("/", requestUrl.origin).toString();
    const errorUrl = new URL("/api/auth/error?error=CredentialsSignin", requestUrl.origin).toString();

    authenticated = loginSucceeds;
    await route.fulfill({
      status: loginSucceeds ? 200 : 401,
      contentType: "application/json",
      body: JSON.stringify({
        url: loginSucceeds ? successUrl : errorUrl,
      }),
    });
  });
}
