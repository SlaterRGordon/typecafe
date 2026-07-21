import { drillTargetToken } from "../../../src/lib/coachingTarget";
import type { TimelineEvidence } from "../../../src/lib/evidenceNormalization";
import { encodeTimeline, type TestEvidenceEvent } from "../../../src/lib/keystrokes";

// A deterministic Impact fixture: common br is 1.4x baseline while rare io is
// 2x. Cost-per-1,000 should still choose br.
export function impactTimeline(testId: number): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  const addPairs = (pair: string, gap: number, repeats: number) => {
    for (let index = 0; index < repeats; index += 1) {
      t += 100;
      events.push({ key: pair[0]!, typed: pair[0]!, correct: true, t });
      t += gap;
      events.push({ key: pair[1]!, typed: pair[1]!, correct: true, t });
      t += 100;
      events.push({ key: " ", typed: " ", correct: true, t });
    }
  };
  addPairs("th", 80, 27);
  addPairs("th", 100, 27);
  addPairs("th", 120, 26);
  addPairs("br", 140, 20);
  addPairs("io", 200, 4);
  return {
    completedAt: Date.now() + testId,
    context: "natural",
    mode: 0,
    subMode: 0,
    count: 60,
    options: "",
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
  };
}

/** Natural accuracy + speed evidence with contradictory Practice reps. */
export function keyboardEvidenceTimeline(testId: number, context: "natural" | "custom-practice" = "natural"): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  for (let index = 0; index < 24; index += 1) {
    t += 100;
    events.push({ key: "t", typed: "t", correct: true, t });
    t += context === "natural" ? 240 : 30;
    const correct = context === "natural" ? index % 2 === 0 : true;
    events.push({ key: "h", typed: correct ? "h" : "x", correct, t });
    t += 100;
    events.push({ key: " ", typed: " ", correct: true, t });
  }
  return {
    completedAt: Date.now() + testId,
    context,
    mode: context === "natural" ? 0 : 1,
    subMode: 0,
    count: 60,
    options: "",
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
    ...(context === "custom-practice" ? {
      practice: {
        v: 1 as const,
        kind: "custom" as const,
        focus: { kind: "keys" as const, items: ["h"] },
        textStyle: "varied" as const,
        durationSeconds: 60 as const,
        elapsedActivityMs: 60_000,
        completed: true,
      },
    } : {}),
  };
}

// A focused acquisition run for the br transition, tagged with its Target
// token and newer than the impact timelines — the Target is drilled but not
// yet re-measured by a natural Test.
export function brDrillTimeline(testId: number): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  for (let index = 0; index < 10; index += 1) {
    t += 100;
    events.push({ key: "b", typed: "b", correct: true, t });
    t += 90;
    events.push({ key: "r", typed: "r", correct: true, t });
    t += 100;
    events.push({ key: " ", typed: " ", correct: true, t });
  }
  const target = { kind: "transition", pair: "br", metric: "latency" } as const;
  return {
    // A minute ahead of the natural fixtures: building several fixtures takes
    // real milliseconds, so `Date.now() + testId` alone can race the ordering.
    completedAt: Date.now() + 60_000 + testId,
    context: "acquisition",
    mode: 0,
    subMode: 1,
    count: 10,
    options: drillTargetToken(target),
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
    practice: {
      v: 1,
      kind: "guided",
      target,
      focus: { kind: "grams", items: ["br"] },
      textStyle: "varied",
      durationSeconds: 60,
      elapsedActivityMs: 60_000,
      completed: true,
    },
  };
}

/** Prior Guided Gram response used to exercise a real Practice Delta. */
export function tionDrillTimeline(testId: number): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  for (let repeat = 0; repeat < 10; repeat += 1) {
    for (const key of "tion") {
      t += 80;
      events.push({ key, typed: key, correct: true, t });
    }
    t += 100;
    events.push({ key: " ", typed: " ", correct: true, t });
  }
  const target = { kind: "gram", gram: "tion" } as const;
  return {
    completedAt: Date.now() + testId,
    context: "acquisition",
    mode: 0,
    subMode: 1,
    count: 60,
    options: drillTargetToken(target),
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
    practice: {
      v: 1,
      kind: "guided",
      target,
      focus: { kind: "grams", items: ["tion"] },
      textStyle: "varied",
      durationSeconds: 60,
      elapsedActivityMs: 60_000,
      completed: true,
    },
  };
}

// A higher-order fixture with a stable 100ms rhythm and a personally slow
// `tion` across several words. Two Timelines clear both Test and word diversity.
export function higherOrderTimeline(testId: number): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  const addWord = (word: string, gaps: number[], repeats = 1) => {
    const characters = [...word];
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      t += 100;
      events.push({ key: characters[0]!, typed: characters[0]!, correct: true, t });
      for (let index = 1; index < characters.length; index += 1) {
        t += gaps[index - 1]!;
        events.push({ key: characters[index]!, typed: characters[index]!, correct: true, t });
      }
      t += 100;
      events.push({ key: " ", typed: " ", correct: true, t });
    }
  };
  addWord("baba", [80, 100, 120], 60);
  for (const word of ["action", "station", "motion", "nation", "portion"]) {
    const characters = [...word];
    addWord(word, characters.slice(1).map((_, index) => index >= characters.length - 4 ? 160 : 100), 2);
  }
  return {
    completedAt: Date.now() + testId,
    context: "natural",
    mode: 0,
    subMode: 0,
    count: 60,
    options: "",
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
  };
}

// Reproduces a mature evidence pool where one completed key-Accuracy Target is
// surrounded by many other supported key and transition weaknesses. `r` is
// deliberately the highest-Impact candidate so its same-Target Mastery row
// exercises the Progress projection's bounded-list invariant.
export function crowdedAccuracyTimeline(testId: number): TimelineEvidence {
  const events: TestEvidenceEvent[] = [];
  let t = 0;
  const addPair = (to: string, repeats: number) => {
    for (let index = 0; index < repeats; index += 1) {
      t += 100;
      events.push({ key: "e", typed: "e", correct: true, t });
      t += 100;
      const correct = index % 5 !== 0;
      events.push({ key: to, typed: correct ? to : "x", correct, t });
      t += 100;
      events.push({ key: " ", typed: " ", correct: true, t });
    }
  };
  for (const gap of [80, 100, 120]) {
    for (let index = 0; index < 20; index += 1) {
      t += 100;
      events.push({ key: "t", typed: "t", correct: true, t });
      t += gap;
      events.push({ key: "h", typed: "h", correct: true, t });
      t += 100;
      events.push({ key: " ", typed: " ", correct: true, t });
    }
  }
  addPair("r", 30);
  for (const key of [..."oiutlcdbgwvzkqypf"]) addPair(key, 10);
  return {
    completedAt: Date.now() + testId,
    context: "natural",
    mode: 0,
    subMode: 0,
    count: 60,
    options: "",
    punctuation: false,
    capitals: false,
    numbers: false,
    layout: "qwerty",
    pool: "qwerty",
    language: "english",
    timeline: encodeTimeline(events),
  };
}
