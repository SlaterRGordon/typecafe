import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Stamp when this run began. The screenshot tour deletes any capture older
// than this (see screenshots.spec.ts beforeAll), so renamed/removed tests
// leave no orphans — without a per-worker rm racing to wipe a sibling
// worker's fresh captures under fullyParallel.
export const runStartFile = join(__dirname, "../../test-results/run-start");

export default function globalSetup() {
  mkdirSync(join(__dirname, "../../test-results"), { recursive: true });
  writeFileSync(runStartFile, String(Date.now()));
}
