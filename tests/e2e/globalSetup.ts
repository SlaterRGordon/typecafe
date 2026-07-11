import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";

// Stamp when this run began. The screenshot tour deletes any capture older
// than this (see screenshots.spec.ts beforeAll), so renamed/removed tests
// leave no orphans - without a per-worker rm racing to wipe a sibling
// worker's fresh captures under fullyParallel.
export const runStartFile = join(__dirname, "../../test-results/run-start");

export default function globalSetup(config: FullConfig) {
  mkdirSync(join(__dirname, "../../test-results"), { recursive: true });
  // A filtered run (-g) captures only a subset, so pruning would delete every
  // other capture. Workers can't see the CLI grep (testInfo.config.grep stays
  // the default there), so decide here and stamp a sentinel the prune skips.
  // ponytail: doesn't detect line-number filters, only grep - full runs are the norm.
  const filtered = String(config.grep) !== String(/.*/);
  writeFileSync(runStartFile, filtered ? "skip" : String(Date.now()));
}
