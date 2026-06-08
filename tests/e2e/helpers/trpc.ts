import type { Page, Route } from "@playwright/test";
import superjson from "superjson";

type ProcedureInput = Record<string, unknown> | undefined;
interface MockTrpcOptions {
  savedLearnProgress?: unknown[];
  importedLearnProgress?: unknown[];
  profileImage?: string | null;
}

const profileUser: {
  id: string;
  name: string;
  email: string;
  emailVerified: null;
  username: string;
  image: string | null;
  bio: string;
  link: string;
} = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: null,
  username: "testuser",
  image: null,
  bio: "Typing fast, testing faster.",
  link: "https://type.cafe",
};

let currentProfileUser = { ...profileUser };

function serializeResult(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

function deserializeInput(rawInput: string | null | undefined, index: number): ProcedureInput {
  if (!rawInput) return undefined;

  const parsed = JSON.parse(rawInput) as Record<string, unknown>;
  const value = parsed[index.toString()] ?? parsed;

  if (value && typeof value === "object" && "json" in value) {
    return superjson.deserialize(value as Parameters<typeof superjson.deserialize>[0]) as ProcedureInput;
  }

  return value as ProcedureInput;
}

function getRawInputForRequest(route: Route) {
  const url = new URL(route.request().url());
  const queryInput = url.searchParams.get("input");
  if (queryInput) return queryInput;

  return route.request().postData();
}

function makeScore(input: ProcedureInput) {
  const count = typeof input?.count === "number" ? input.count : 15;
  const userId = typeof input?.userId === "string" ? input.userId : profileUser.id;

  return {
    id: `score-${count}-${userId}`,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    summaryDate: new Date("2026-06-01T00:00:00.000Z"),
    typeId: "type-normal",
    userId,
    speed: count >= 100 ? 101.25 : count >= 25 ? 88.5 : 72.35,
    accuracy: count >= 100 ? 98.25 : 96.5,
    score: 7000,
    count,
    options: "",
    user: {
      ...profileUser,
      id: userId,
    },
  };
}

function responseForProcedure(procedure: string, input: ProcedureInput, options: MockTrpcOptions, state: { importedLearnProgress: boolean }) {
  switch (procedure) {
    case "type.get":
      return {
        id: "type-normal",
        mode: input?.mode ?? 0,
        subMode: input?.subMode ?? 0,
        language: input?.language ?? "english",
        competitive: true,
      };
    case "type.getAll":
      return [
        { id: "type-normal", mode: 0, subMode: input?.subMode ?? 0, language: "english", competitive: true },
      ];
    case "test.getAll":
      return [makeScore(input)];
    case "test.getTimeTyped":
      return { _sum: { count: 1234 } };
    case "test.getBestScore":
      return makeScore({ count: 120, userId: input?.userId });
    case "test.getPercentile":
      return { better: 0, worse: 5, total: 5, percentile: 0 };
    case "test.getActivityByDate":
      return [];
    case "learnProgress.getByDifficulty":
      return state.importedLearnProgress ? (options.importedLearnProgress ?? options.savedLearnProgress ?? []) : (options.savedLearnProgress ?? []);
    case "learnProgress.batchImport":
      state.importedLearnProgress = true;
      return [];
    case "learnProgress.complete":
      return [];
    case "user.get":
      return currentProfileUser;
    case "user.getProfileByUsername":
      return profileUser;
    case "user.checkUsernameExists":
      return false;
    case "user.update":
      currentProfileUser = {
        ...currentProfileUser,
        username: typeof input?.username === "string" ? input.username : currentProfileUser.username,
        bio: typeof input?.bio === "string" ? input.bio : currentProfileUser.bio,
        link: typeof input?.link === "string" ? input.link : currentProfileUser.link,
        image: typeof input?.image === "string" || input?.image === null ? input.image : currentProfileUser.image,
      };
      return currentProfileUser;
    case "user.delete":
      return currentProfileUser;
    case "color.getByUser":
      return [];
    case "color.create":
      return null;
    default:
      return null;
  }
}

export async function mockTrpc(page: Page, options: MockTrpcOptions = {}) {
  currentProfileUser = { ...profileUser, image: options.profileImage ?? profileUser.image };
  const state = { importedLearnProgress: false };

  await page.route("**/api/trpc/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const procedurePath = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "");
    const procedures = procedurePath.split(",");
    const rawInput = getRawInputForRequest(route);

    const body = procedures.map((procedure, index) => {
      const input = deserializeInput(rawInput, index);
      return serializeResult(responseForProcedure(procedure, input, options, state));
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("batch") === "1" ? body : body[0]),
    });
  });
}

export async function mockAuthenticatedSession(page: Page, image: string | null = profileUser.image) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: profileUser.id,
          name: profileUser.name,
          email: profileUser.email,
          username: profileUser.username,
          image,
        },
        expires: "2099-01-01T00:00:00.000Z",
      }),
    });
  });
}
