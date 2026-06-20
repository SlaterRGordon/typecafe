import type { Page, Route } from "@playwright/test";
import superjson from "superjson";

type ProcedureInput = Record<string, unknown> | undefined;
interface MockTrpcOptions {
  savedLearnProgress?: unknown[];
  importedLearnProgress?: unknown[];
  profileImage?: string | null;
  emptyScores?: boolean;
  invalidShare?: boolean;
  // Per-key practice stats for the /progress lifetime heatmap.
  keyStats?: { character: string; total: number; correct: number }[];
  // Make the progress history flat (a plateau) instead of rising.
  flatProgress?: boolean;
  // Procedures listed here resolve to a tRPC error instead of data, so tests can
  // exercise client-side failure handling (e.g. a save that fails on the network).
  errorProcedures?: string[];
  onProcedure?: (procedure: string, input: ProcedureInput) => void;
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
  link: "https://typecafe.vercel.app",
};

let currentProfileUser = { ...profileUser };

function serializeResult(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

function serializeError(procedure: string) {
  return {
    error: superjson.serialize({
      message: `Simulated failure for ${procedure}`,
      code: -32603,
      data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: procedure,
      },
    }),
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
    ranked: typeof input?.ranked === "boolean" ? input.ranked : true,
    user: {
      ...profileUser,
      id: userId,
    },
  };
}

function makeScoreSnapshot() {
  const typedText = "olympus worse sharing touching authorized commodities modems colon malpractice";
  return {
    durationSeconds: 15,
    rawWpm: 72.35,
    netWpm: 68.7,
    accuracy: 96.5,
    avgDelta: 4.1,
    totalKeystrokes: 548,
    correctKeystrokes: 531,
    incorrectKeystrokes: 17,
    promptText: typedText,
    typedText,
    typedSegments: typedText.split("").map((ch, index) => ({ ch, correct: index % 17 !== 0 })),
    wpmSamples: [
      { elapsedSeconds: 0, wpm: 0 },
      { elapsedSeconds: 5, wpm: 45 },
      { elapsedSeconds: 10, wpm: 62 },
      { elapsedSeconds: 15, wpm: 72.35 },
    ],
  };
}

// A rising WPM history over the last ~60 days, generated relative to now so the
// /progress headline delta is deterministic (current window beats the prior).
function makeProgressRecords(flat = false) {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => {
    const daysAgo = 58 - i * 2.5;
    return {
      wpm: flat ? 70 + (i % 2 === 0 ? 0.4 : -0.4) : 58 + i * 1.1,
      accuracy: 94 + (i % 5),
      consistency: 74 + (i % 8),
      count: 30,
      createdAt: new Date(now - daysAgo * dayMs),
      mode: 0,
      subMode: 0,
      language: "english",
    };
  });
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
      if (options.emptyScores) return [];
      return [makeScore(input)];
    case "test.create":
      return { ...makeScore({ ...input, userId: profileUser.id }), brag: "Faster than 72% of similar starters", avgDelta: 3.2, streak: 5 };
    case "test.getDailyChallengeStatus":
      return {
        today: { dateKey: input?.dateKey ?? "2026-06-16", wpm: 82.4, accuracy: 98.1, t: Date.now(), delta: 3.2 },
        yesterday: { dateKey: "2026-06-15", wpm: 79.1, accuracy: 97.4, t: Date.now() - 24 * 60 * 60 * 1000 },
        streak: 4,
      };
    case "test.getDailyChallengeBoards":
      return {
        fastest: [
          { rank: 1, userId: profileUser.id, username: profileUser.username, image: profileUser.image, speed: 82.4, accuracy: 98.1 },
          { rank: 2, userId: "user-2", username: "steadykeys", image: null, speed: 76.2, accuracy: 97.3 },
        ],
        improved: [
          { rank: 1, userId: "user-3", username: "slowgain", image: null, speed: 61.5, accuracy: 96.2, baseline: 55.5, delta: 6.0, baselineTests: 5 },
          { rank: 2, userId: profileUser.id, username: profileUser.username, image: profileUser.image, speed: 82.4, accuracy: 98.1, baseline: 79.2, delta: 3.2, baselineTests: 9 },
        ],
      };
    case "test.getTimeTyped":
      return { _sum: { count: 1234 } };
    case "test.getBestScore":
      return makeScore({ count: 120, userId: input?.userId });
    case "test.getPercentile":
      return { better: 0, worse: 5, total: 5, percentile: 0 };
    case "test.getProgressRecords":
      if (options.emptyScores) return [];
      return makeProgressRecords(options.flatProgress);
    case "test.getActivityByDate":
      // Recent consecutive days so the profile streak chip has data.
      return Array.from({ length: 5 }, (_, i) => ({
        summaryDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        _count: { _all: 3 },
      }));
    case "learnProgress.getByDifficulty":
      return state.importedLearnProgress ? (options.importedLearnProgress ?? options.savedLearnProgress ?? []) : (options.savedLearnProgress ?? []);
    case "learnProgress.batchImport":
      state.importedLearnProgress = true;
      return [];
    case "learnProgress.complete":
      return [];
    case "practiceStats.get":
      return options.keyStats ?? [];
    case "transitionStats.get":
      if (options.emptyScores) return [];
      return [
        { pair: "br", count: 12, totalMs: 4800, errors: 3 }, // 400ms mean, 25% errors
        { pair: "th", count: 30, totalMs: 3000, errors: 0 }, // 100ms
        { pair: "he", count: 25, totalMs: 3000, errors: 0 }, // 120ms
        { pair: "io", count: 10, totalMs: 3000, errors: 1 }, // 300ms
      ];
    case "transitionStats.batchSync":
      return { count: Array.isArray(input?.stats) ? input.stats.length : 0 };
    case "practiceStats.batchSync":
      return { count: Array.isArray(input?.stats) ? input.stats.length : 0 };
    case "user.get":
      return currentProfileUser;
    case "user.getProfileByUsername":
      return profileUser;
    case "user.checkUsernameExists":
      return false;
    case "user.registerUser":
      return {
        id: profileUser.id,
        email: input?.email,
        username: input?.username,
      };
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
    case "scoreShare.create":
      return { slug: "share-test-score" };
    case "scoreShare.createBeatRun":
      return { slug: "beat-run-share" };
    case "scoreShare.createProgress":
      return { slug: "progress-test-share" };
    case "scoreShare.get":
      if (options.invalidShare) return null;
      if (input?.slug === "beat-source-score") {
        const promptText = "steady hands";
        return {
          kind: "score",
          id: "share-beat-source",
          slug: input.slug,
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
          expiresAt: null,
          score: {
            id: "score-beat-source",
            speed: 50,
            accuracy: 95,
            score: 4750,
            count: 2,
            options: "",
            createdAt: new Date("2026-06-01T12:00:00.000Z"),
            mode: 0,
            subMode: 1,
            language: "english",
            punctuation: false,
            capitals: false,
            ranked: true,
          },
          snapshot: {
            durationSeconds: 2,
            rawWpm: 50,
            netWpm: 47.5,
            accuracy: 95,
            totalKeystrokes: promptText.length,
            correctKeystrokes: promptText.length - 1,
            incorrectKeystrokes: 1,
            promptText,
            typedText: promptText,
            typedSegments: promptText.split("").map((ch) => ({ ch, correct: true })),
            wpmSamples: [
              { elapsedSeconds: 0, wpm: 0 },
              { elapsedSeconds: 2, wpm: 50 },
            ],
          },
          user: { id: profileUser.id, username: profileUser.username, image: profileUser.image },
        };
      }
      if (input?.slug === "beat-run-share") {
        const promptText = "steady hands";
        return {
          kind: "beat",
          id: "share-beat-run",
          slug: input.slug,
          createdAt: new Date("2026-06-01T12:05:00.000Z"),
          expiresAt: null,
          score: null,
          snapshot: {
            durationSeconds: 1.8,
            rawWpm: 73.3,
            netWpm: 73.3,
            accuracy: 100,
            totalKeystrokes: promptText.length,
            correctKeystrokes: promptText.length,
            incorrectKeystrokes: 0,
            promptText,
            typedText: promptText,
            typedSegments: promptText.split("").map((ch) => ({ ch, correct: true })),
            wpmSamples: [
              { elapsedSeconds: 0, wpm: 0 },
              { elapsedSeconds: 1.8, wpm: 73.3 },
            ],
            brag: "Beat by +23.3 WPM",
            count: 2,
            mode: 0,
            subMode: 1,
            language: "english",
            sourceShareSlug: "beat-source-score",
            attemptNumber: 1,
            createdAt: Date.parse("2026-06-01T12:05:00.000Z"),
          },
          user: null,
        };
      }
      if (typeof input?.slug === "string" && input.slug.startsWith("progress")) {
        return {
          id: "share-progress-1",
          slug: input.slug,
          kind: "progress",
          createdAt: new Date("2026-06-15T12:00:00.000Z"),
          expiresAt: null,
          score: null,
          snapshot: {
            deltaWpm: 12.5,
            periodLabel: "30 days",
            points: Array.from({ length: 10 }, (_, i) => ({ t: Date.UTC(2026, 5, 5 + i), wpm: 60 + i * 1.4 })),
            streak: 4,
            username: profileUser.username,
            generatedAt: Date.UTC(2026, 5, 15),
          },
          user: { id: profileUser.id, username: profileUser.username, image: profileUser.image },
        };
      }
      return {
        kind: "score",
        id: "share-1",
        slug: input?.slug ?? "share-test-score",
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        expiresAt: null,
        score: {
          id: "score-15-user-1",
          speed: 72.35,
          accuracy: 96.5,
          score: 6982,
          count: 15,
          options: "",
          createdAt: new Date("2026-06-01T12:00:00.000Z"),
          mode: 0,
          subMode: 0,
          language: "english",
        },
        snapshot: makeScoreSnapshot(),
        user: {
          id: profileUser.id,
          username: profileUser.username,
          image: profileUser.image,
        },
      };
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
      options.onProcedure?.(procedure, input);
      if (options.errorProcedures?.includes(procedure)) return serializeError(procedure);
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
