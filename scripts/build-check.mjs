import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = ".next-check";
const HOME_ROUTE_GZIP_BUDGET = 320 * 1024;

function verifyHomeRouteBudget() {
  const manifest = JSON.parse(readFileSync(path.join(distDir, "build-manifest.json"), "utf8"));
  const files = [...new Set([
    ...(manifest.pages["/_app"] ?? []),
    ...(manifest.pages["/"] ?? []),
  ])].filter((file) => /\.(?:js|css)$/.test(file));

  const compressedBytes = files.reduce((total, file) => {
    const contents = readFileSync(path.join(distDir, file));
    return total + gzipSync(contents).byteLength;
  }, 0);
  const compressedKiB = (compressedBytes / 1024).toFixed(1);

  if (compressedBytes > HOME_ROUTE_GZIP_BUDGET) {
    console.error(`Home route JS/CSS is ${compressedKiB} KiB gzip; budget is ${HOME_ROUTE_GZIP_BUDGET / 1024} KiB.`);
    process.exit(1);
  }

  console.log(`Home route JS/CSS: ${compressedKiB} KiB gzip (budget ${HOME_ROUTE_GZIP_BUDGET / 1024} KiB).`);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["next", "build"], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`next build exited with signal ${signal}`);
    process.exit(1);
  }

  if (code !== 0) process.exit(code ?? 1);

  verifyHomeRouteBudget();
});
