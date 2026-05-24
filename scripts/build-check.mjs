import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["next", "build"], {
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next-check",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`next build exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
