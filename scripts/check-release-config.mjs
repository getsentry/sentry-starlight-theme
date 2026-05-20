#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectMatches(text, pattern) {
  return [
    ...new Set([...text.matchAll(pattern)].map((match) => match[1])),
  ].sort();
}

function collectCraftPackages() {
  return collectMatches(readFile(".craft.yml"), /^\s*id:\s*"([^"]+)"/gm);
}

function collectCraftTargets() {
  const craftConfig = readFile(".craft.yml");
  return [
    ...craftConfig.matchAll(
      /^\s*-\s*name:\s*([^\s#]+)\b[\s\S]*?(?=^\s*-\s*name:|(?![\s\S]))/gm,
    ),
  ].map((match) => ({
    name: match[1],
    block: match[0],
  }));
}

function assertGitHubTargetConfig() {
  const targets = collectCraftTargets();
  const githubTargets = targets.filter((target) => target.name === "github");

  if (githubTargets.length !== 1) {
    console.error(
      "Release config check failed: .craft.yml must define exactly one github target.",
    );
    process.exit(1);
  }

  const [githubTarget] = githubTargets;
  if (targets.at(-1) !== githubTarget) {
    console.error(
      "Release config check failed: the github target must be the final target so npm publishes before the public GitHub release.",
    );
    process.exit(1);
  }

  if (!/^\s*includeNames:\s*\/\^\$\/\s*$/m.test(githubTarget.block)) {
    console.error(
      "Release config check failed: the github target must keep includeNames: /^$/ so package artifacts are not uploaded as GitHub release assets.",
    );
    process.exit(1);
  }
}

function collectBumpPackages() {
  return collectMatches(
    readFile("scripts/bump-release-versions.mjs"),
    /"([^"]*package\.json)"/g,
  )
    .map((relativePath) => JSON.parse(readFile(relativePath)).name)
    .sort();
}

function collectPackPackages() {
  const workflow = readFile(".github/workflows/merge-jobs.yml");

  if (!/pnpm pack --pack-destination artifacts/.test(workflow)) {
    return [];
  }

  return [JSON.parse(readFile("package.json")).name];
}

function describeMismatch(expected, actual) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  const extra = actual.filter((entry) => !expected.includes(entry));

  if (missing.length === 0 && extra.length === 0) {
    return null;
  }

  return { missing, extra };
}

const sources = [
  {
    label: ".craft.yml",
    packages: collectCraftPackages(),
  },
  {
    label: "scripts/bump-release-versions.mjs",
    packages: collectBumpPackages(),
  },
  {
    label: ".github/workflows/merge-jobs.yml",
    packages: collectPackPackages(),
  },
];

const [expectedSource, ...otherSources] = sources;

assertGitHubTargetConfig();

if (expectedSource.packages.length === 0) {
  console.error(
    "Release config check failed: .craft.yml does not define any npm publish targets.",
  );
  process.exit(1);
}

let hasMismatch = false;

for (const source of otherSources) {
  const mismatch = describeMismatch(expectedSource.packages, source.packages);

  if (!mismatch) {
    continue;
  }

  hasMismatch = true;
  console.error(`Release config mismatch in ${source.label}:`);

  if (mismatch.missing.length > 0) {
    console.error(`  Missing: ${mismatch.missing.join(", ")}`);
  }

  if (mismatch.extra.length > 0) {
    console.error(`  Extra: ${mismatch.extra.join(", ")}`);
  }
}

if (hasMismatch) {
  console.error(
    "Release config check failed. Align release package lists with .craft.yml.",
  );
  process.exit(1);
}

console.log(
  `Release config OK: ${expectedSource.packages.length} package aligned across ${sources.length} sources.`,
);
