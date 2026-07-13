import type { Page, Route } from "@playwright/test";
import superjson from "superjson";

type ProcedureInput = Record<string, unknown> | undefined;
interface MockTrpcOptions {
  savedColors?: Array<{
    id: string;
    name: string;
    background: string;
    text: string;
    primary: string;
    secondary: string;
  }>;
  savedTrainProgress?: unknown[];
  importedTrainProgress?: unknown[];
  profileImage?: string | null;
  emptyScores?: boolean;
  invalidShare?: boolean;
  // Per-key practice stats for the /progress lifetime heatmap.
  keyStats?: { character: string; total: number; correct: number }[];
  transitionStats?: { pair: string; count: number; totalMs: number; errors: number }[];
  coachingSession?: unknown;
  // Make the progress history flat (a plateau) instead of rising.
  flatProgress?: boolean;
  // Make the progress history fall so hero sign-specific layout can be tested.
  fallingProgress?: boolean;
  // Mix timed and words records so /progress filter tests can prove scoping.
  mixedProgress?: boolean;
  // Put pairs of tests on the same practiced day so trend tests can prove that
  // every metric plots daily groups rather than raw attempts.
  sameDayProgress?: boolean;
  // Procedures listed here resolve to a tRPC error instead of data, so tests can
  // exercise client-side failure handling (e.g. a save that fails on the network).
  errorProcedures?: string[];
  // Per-procedure response delay in ms (a slow save); a batch waits for the
  // slowest listed procedure it contains.
  delayProcedures?: Record<string, number>;
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
    // The real Test router replays the timeline and rejects these short custom
    // fixtures. The mock has no server replay, so preserve that authoritative
    // outcome for the custom 3s/4s journeys instead of upgrading the eager
    // unranked card to ranked when the mocked save resolves.
    ranked: typeof input?.ranked === "boolean" ? input.ranked : count !== 3 && count !== 4,
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
function makeProgressRecords(flat = false, mixed = false, sameDay = false, falling = false) {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Array.from({ length: 24 }, (_, i) => {
    const daysAgo = sameDay ? 22 - Math.floor(i / 2) * 2 : 58 - i * 2.5;
    const wordsRecord = mixed && i % 2 === 1;
    return {
      wpm: flat ? 70 + (i % 2 === 0 ? 0.4 : -0.4) : falling ? 84 - i * 1.1 : 58 + i * 1.1,
      // Hold accuracy constant for the flat fixture so the derived net WPM stays
      // flat too (varying accuracy would inject a trend the plateau test rejects).
      accuracy: flat ? 96 : 94 + (i % 5),
      consistency: 74 + (i % 8),
      count: wordsRecord ? 25 : 30,
      createdAt: new Date(now - daysAgo * dayMs),
      day: new Date(now - daysAgo * dayMs).toISOString().slice(0, 10),
      mode: 0,
      subMode: wordsRecord ? 1 : 0,
      language: "english",
    };
  });
}

function progressRollupsFromEntries(input: ProcedureInput) {
  const entries = Array.isArray(input?.entries) ? input.entries : [];
  const byDay = new Map<string, { day: string; tests: number; bestWpm: number; totalWpm: number; totalAccuracy: number; totalConsistency: number; consistencySamples: number }>();

  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.wpm !== "number" || typeof entry.accuracy !== "number" || typeof entry.t !== "number") continue;
    const netWpm = Math.max(0, entry.wpm * (2 * entry.accuracy / 100 - 1));
    const day = new Date(entry.t).toISOString().slice(0, 10);
    const current = byDay.get(day) ?? { day, tests: 0, bestWpm: 0, totalWpm: 0, totalAccuracy: 0, totalConsistency: 0, consistencySamples: 0 };
    current.tests += 1;
    current.bestWpm = Math.max(current.bestWpm, netWpm);
    current.totalWpm += netWpm;
    current.totalAccuracy += entry.accuracy;
    if (typeof entry.c === "number") {
      current.totalConsistency += entry.c;
      current.consistencySamples += 1;
    }
    byDay.set(day, current);
  }

  return Array.from(byDay.values()).map((day) => ({
    day: day.day,
    tests: day.tests,
    bestWpm: day.bestWpm,
    avgWpm: day.totalWpm / day.tests,
    avgAccuracy: day.totalAccuracy / day.tests,
    avgConsistency: day.consistencySamples > 0 ? day.totalConsistency / day.consistencySamples : null,
  }));
}

function responseForProcedure(procedure: string, input: ProcedureInput, options: MockTrpcOptions, state: { importedTrainProgress: boolean; syncedProgressRollups: unknown[]; coachingSession: unknown }) {
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
    case "test.getLeaderboard": {
      if (options.emptyScores) return [];
      const count = typeof input?.count === "number" ? input.count : 15;
      const rawWpm = count >= 100 ? 101.25 : count >= 25 ? 88.5 : 72.35;
      const accuracy = count >= 100 ? 98.25 : 96.5;
      const wpm = Math.max(0, rawWpm * (2 * accuracy / 100 - 1));
      return [{
        rank: 1,
        userId: profileUser.id,
        username: profileUser.username,
        image: profileUser.image,
        wpm,
        rawWpm,
        accuracy,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
      }];
    }
    case "test.create":
      return { ...makeScore({ ...input, userId: profileUser.id }), brag: "Faster than 72% of similar starters", avgDelta: 3.2, streak: 5 };
    case "test.syncProgressHistory":
      state.syncedProgressRollups = progressRollupsFromEntries(input);
      return { count: Array.isArray(input?.entries) ? input.entries.length : 0, days: state.syncedProgressRollups.length, rollups: state.syncedProgressRollups };
    case "test.getDailyProgressRollups":
      return state.syncedProgressRollups;
    case "test.getDailyChallengeStatus":
      return {
        today: { dateKey: input?.dateKey ?? "2026-06-16", wpm: 82.4, accuracy: 98.1, t: Date.now(), delta: 3.2 },
        yesterday: { dateKey: "2026-06-15", wpm: 79.1, accuracy: 97.4, t: Date.now() - 24 * 60 * 60 * 1000 },
        streak: 4,
      };
    case "test.getDailyChallengeBoards":
      return {
        fastest: [
          { rank: 1, userId: profileUser.id, username: profileUser.username, image: profileUser.image, wpm: 82.4, accuracy: 98.1 },
          { rank: 2, userId: "user-2", username: "steadykeys", image: null, wpm: 76.2, accuracy: 97.3 },
        ],
        improved: [
          { rank: 1, userId: "user-3", username: "slowgain", image: null, wpm: 61.5, accuracy: 96.2, baseline: 55.5, delta: 6.0, baselineTests: 5 },
          { rank: 2, userId: profileUser.id, username: profileUser.username, image: profileUser.image, wpm: 82.4, accuracy: 98.1, baseline: 79.2, delta: 3.2, baselineTests: 9 },
        ],
      };
    case "test.getTimeTyped":
      return { _sum: { count: 1234 } };
    case "test.getBestScore":
      return makeScore({ count: 120, userId: input?.userId });
    case "test.getSignatureBests":
      if (options.emptyScores) return [
        { key: "timed-15", eyebrow: "15 seconds", wpm: null, rawWpm: null, accuracy: null, createdAt: null },
        { key: "timed-60", eyebrow: "60 seconds", wpm: null, rawWpm: null, accuracy: null, createdAt: null },
        { key: "words-100", eyebrow: "100 words", wpm: null, rawWpm: null, accuracy: null, createdAt: null },
      ];
      return [
        { key: "timed-15", eyebrow: "15 seconds", wpm: 72.3, rawWpm: 75.0, accuracy: 96.5, createdAt: new Date("2026-06-01T12:00:00.000Z") },
        { key: "timed-60", eyebrow: "60 seconds", wpm: 88.5, rawWpm: 91.0, accuracy: 97.4, createdAt: new Date("2026-06-10T12:00:00.000Z") },
        { key: "words-100", eyebrow: "100 words", wpm: 101.2, rawWpm: 104.0, accuracy: 98.2, createdAt: new Date("2026-06-12T12:00:00.000Z") },
      ];
    case "test.getProfileProof":
      if (options.emptyScores) return {
        bestWpm: null,
        baselineWpm: null,
        baselineAccuracy: null,
        baselineConsistency: null,
        baselineCount: 0,
        recentWpm: null,
        recentAccuracy: null,
        recentConsistency: null,
        thirtyDayDelta: null,
        recentCount: 0,
      };
      return {
        bestWpm: 101.2,
        baselineWpm: 78.4,
        baselineAccuracy: 96.1,
        baselineConsistency: 77.6,
        baselineCount: 10,
        recentWpm: 84.6,
        recentAccuracy: 97.4,
        recentConsistency: 82.1,
        thirtyDayDelta: 4.2,
        recentCount: 10,
      };
    case "test.getPercentile":
      return { better: 0, worse: 5, total: 5, percentile: 0 };
    case "test.getProgressRecords":
      if (options.emptyScores) return [];
      return makeProgressRecords(options.flatProgress, options.mixedProgress, options.sameDayProgress, options.fallingProgress);
    case "test.getActivityByDate":
      // Recent consecutive days so the profile streak chip has data.
      return Array.from({ length: 5 }, (_, i) => ({
        summaryDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        _count: { _all: 3 },
      }));
    case "trainProgress.getByDifficulty":
      return state.importedTrainProgress ? (options.importedTrainProgress ?? options.savedTrainProgress ?? []) : (options.savedTrainProgress ?? []);
    case "trainProgress.getSummary":
      if (options.emptyScores) return {
        hardestClear: null,
        difficulties: ["easy", "medium", "hard", "extreme", "insane"].map((difficulty) => ({
          difficulty,
          label: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
          levelsCompleted: 0,
          totalLevels: 100,
          starsEarned: 0,
          totalStars: 300,
          percentComplete: 0,
          highestLevel: null,
        })),
      };
      return {
        hardestClear: { difficulty: "medium", label: "Medium", level: 12 },
        difficulties: [
          { difficulty: "easy", label: "Easy", levelsCompleted: 32, totalLevels: 100, starsEarned: 71, totalStars: 300, percentComplete: 32, highestLevel: 32 },
          { difficulty: "medium", label: "Medium", levelsCompleted: 12, totalLevels: 100, starsEarned: 24, totalStars: 300, percentComplete: 12, highestLevel: 12 },
          { difficulty: "hard", label: "Hard", levelsCompleted: 0, totalLevels: 100, starsEarned: 0, totalStars: 300, percentComplete: 0, highestLevel: null },
          { difficulty: "extreme", label: "Extreme", levelsCompleted: 0, totalLevels: 100, starsEarned: 0, totalStars: 300, percentComplete: 0, highestLevel: null },
          { difficulty: "insane", label: "Insane", levelsCompleted: 0, totalLevels: 100, starsEarned: 0, totalStars: 300, percentComplete: 0, highestLevel: null },
        ],
      };
    case "trainProgress.batchImport":
      state.importedTrainProgress = true;
      return [];
    case "trainProgress.complete":
      return [];
    case "practiceStats.get":
      return options.keyStats ?? [];
    case "transitionStats.get":
      if (options.emptyScores) return [];
      if (options.transitionStats) return options.transitionStats;
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
    case "coachingSession.getToday":
      return state.coachingSession;
    case "coachingSession.save":
      state.coachingSession = input?.snapshot ?? null;
      return state.coachingSession;
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
      return options.savedColors ?? [];
    case "color.delete":
      return null;
    case "color.create":
      return null;
    case "scoreShare.create":
      return { slug: "share-test-score" };
    case "scoreShare.createGuestScore":
      return { slug: "guest-score-share" };
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
      if (input?.slug === "guest-score-share") {
        // A guest score share: no Test row (score null), all render fields live
        // in the snapshot. Exercises the snapshot-only render + OG fallback.
        return {
          kind: "score",
          id: "share-guest-score",
          slug: input.slug,
          createdAt: new Date("2026-06-02T12:00:00.000Z"),
          expiresAt: null,
          score: null,
          snapshot: {
            ...makeScoreSnapshot(),
            count: 15,
            mode: 0,
            subMode: 1,
            language: "english",
            speed: 72.35,
            score: 6982,
            createdAt: Date.parse("2026-06-02T12:00:00.000Z"),
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
  const state = { importedTrainProgress: false, syncedProgressRollups: [] as unknown[], coachingSession: options.coachingSession ?? null };

  await page.route("**/api/trpc/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const procedurePath = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "");
    const procedures = procedurePath.split(",");
    const rawInput = getRawInputForRequest(route);

    const delay = Math.max(0, ...procedures.map((procedure) => options.delayProcedures?.[procedure] ?? 0));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

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
