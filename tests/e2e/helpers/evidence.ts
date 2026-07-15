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
