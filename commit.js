#!/usr/bin/env node
/**
 * commit.js — Replays a commit schedule into a Git repo.
 *
 * Creates one empty commit per entry in the schedule, with the commit date
 * backdated to match the schedule. GitHub counts backdated commits toward
 * the contribution graph as long as they land in the correct calendar day
 * in your local timezone (which becomes UTC when pushed).
 *
 * Usage:
 *   node commit.js --input commits.json --repo /path/to/your/repo [--dry-run]
 *
 * Requirements:
 *   - git installed and on PATH
 *   - The repo must already exist and be linked to a GitHub remote
 *   - Your GitHub account email must match the email in git config
 *
 * Flags:
 *   --input    Path to the JSON schedule file from generate.js  [required]
 *   --repo     Path to the target git repository               [required]
 *   --dry-run  Print what would happen without executing        [optional]
 *   --push     Automatically push after committing              [optional]
 *   --branch   Branch to push to (default: main)               [optional]
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has  = (flag) => args.includes(flag);

const inputFile = get("--input");
const repoPath  = get("--repo");
const dryRun    = has("--dry-run");
const autoPush  = has("--push");
const branch    = get("--branch") || "main";

if (!inputFile || !repoPath) {
  console.error("Usage: node commit.js --input commits.json --repo /path/to/repo [--dry-run] [--push]");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load schedule
// ---------------------------------------------------------------------------
const schedule = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const commits  = schedule.commits;
console.log(`Loaded ${commits.length} commits for year ${schedule.year}`);

if (dryRun) {
  console.log("\n[DRY RUN] Would make the following commits:");
  const grouped = {};
  for (const c of commits) {
    grouped[c.date] = (grouped[c.date] || 0) + 1;
  }
  for (const [date, count] of Object.entries(grouped).sort()) {
    console.log(`  ${date}  ×${count}`);
  }
  console.log("\n[DRY RUN] No changes made.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function exec(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: "pipe" }).toString().trim();
}

function makeCommit(repoDir, dateStr, index) {
  // Use noon UTC on the target day to avoid timezone edge cases
  const isoDate = `${dateStr}T12:00:00`;
  const msg     = `ascii art commit ${index}`;

  // Write a small change so the commit is not empty (some git configs reject empty commits)
  const markerFile = path.join(repoDir, ".ascii-art-marker");
  fs.writeFileSync(markerFile, `${dateStr}-${index}\n`);

  exec(`git add .ascii-art-marker`, repoDir);
  exec(
    `git commit --allow-empty -m "${msg}" --date="${isoDate}"`,
    repoDir
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const absRepo = path.resolve(repoPath);

if (!fs.existsSync(path.join(absRepo, ".git"))) {
  console.error(`Error: ${absRepo} is not a git repository.`);
  process.exit(1);
}

// Verify git identity is set
try {
  exec("git config user.email", absRepo);
  exec("git config user.name", absRepo);
} catch {
  console.error(
    "Error: git user.email and user.name must be configured.\n" +
    "Run: git config --global user.email 'you@example.com'\n" +
    "     git config --global user.name 'Your Name'"
  );
  process.exit(1);
}

// Sort commits by date so history is clean
const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));

console.log(`\nMaking ${sorted.length} commits in: ${absRepo}`);
console.log("This may take a minute...\n");

let done = 0;
const start = Date.now();

for (const entry of sorted) {
  makeCommit(absRepo, entry.date, done);
  done++;
  if (done % 50 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ${done}/${sorted.length} commits (${elapsed}s elapsed)`);
  }
}

console.log(`\nDone! ${done} commits created in ${((Date.now() - start) / 1000).toFixed(1)}s`);

if (autoPush) {
  console.log(`\nPushing to origin/${branch}...`);
  try {
    exec(`git push origin ${branch}`, absRepo);
    console.log("Push successful! Check your GitHub profile in a few minutes.");
  } catch (e) {
    console.error("Push failed:", e.message);
    console.log(`Manually run: cd "${absRepo}" && git push origin ${branch}`);
  }
} else {
  console.log(`\nTo publish: cd "${absRepo}" && git push origin ${branch}`);
  console.log("Your contribution graph will update within a few minutes of pushing.");
}
