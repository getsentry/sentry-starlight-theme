#!/usr/bin/env node
import { spawnSync } from "node:child_process";

if (process.env.CI === "true") {
  process.exit(0);
}

const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  stdio: "ignore",
});

if (gitCheck.status !== 0) {
  console.log("Skipping git hook installation outside a git worktree.");
  process.exit(0);
}

const result = spawnSync("simple-git-hooks", {
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
