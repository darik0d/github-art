#!/usr/bin/env node
/**
 * clean.js — Wipe all art commits from the scratch repo so you can redraw.
 *
 * Because git history is append-only, "cleaning" means orphaning the branch:
 * we create a brand-new root commit with no history, then force-push it.
 * GitHub will update the contribution graph within a few minutes.
 *
 * Usage:
 *   node clean.js --repo /path/to/github-art [--branch main] [--dry-run]
 *
 * WARNING: This destroys all commit history in the repo. Only use it on the
 * dedicated scratch repo, never on a repo with real code.
 */

const { execSync } = require("child_process");
const fs           = require("fs");
const path         = require("path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args   = process.argv.slice(2);
const get    = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has    = (flag) => args.includes(flag);

const repoArg = get("--repo") || ".";
const branch  = get("--branch") || "main";
const dryRun  = has("--dry-run");

const absRepo = path.resolve(repoArg);

// ---------------------------------------------------------------------------
// Sanity checks
// ---------------------------------------------------------------------------
if (!fs.existsSync(path.join(absRepo, ".git"))) {
  console.error(`Error: ${absRepo} is not a git repository.`);
  process.exit(1);
}

function exec(cmd) {
  return execSync(cmd, { cwd: absRepo, stdio: "pipe" }).toString().trim();
}

// Verify git identity
try {
  exec("git config user.email");
  exec("git config user.name");
} catch {
  console.error(
    "Error: git user.email and user.name must be configured.\n" +
    "  git config --global user.email 'you@example.com'\n" +
    "  git config --global user.name 'Your Name'"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Confirm (unless dry-run)
// ---------------------------------------------------------------------------
console.log(`Repo:   ${absRepo}`);
console.log(`Branch: ${branch}`);
console.log("");

if (dryRun) {
  console.log("[DRY RUN] Would orphan branch and force-push — no changes made.");
  process.exit(0);
}

// Simple confirmation prompt
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(
  "WARNING: This will erase ALL commit history in this repo and force-push.\n" +
  "Only do this on the dedicated scratch repo.\n\n" +
  "Type YES to continue: ",
  (answer) => {
    rl.close();
    if (answer.trim() !== "YES") {
      console.log("Aborted.");
      process.exit(0);
    }
    run();
  }
);

// ---------------------------------------------------------------------------
// Clean
// ---------------------------------------------------------------------------
function run() {
  console.log("\nOrphaning branch...");

  // Create a new orphan branch (no history)
  exec(`git checkout --orphan _clean_temp`);

  // Stage everything currently in the working tree (just the marker file, if any)
  // then immediately remove it so the repo is truly empty
  try { exec("git rm -rf ."); } catch { /* nothing staged is fine */ }

  // Write a minimal README so the commit is not empty
  const msg = "# github-art\n\nScratch repo for GitHub contribution graph art.\n";
  fs.writeFileSync(path.join(absRepo, "README.md"), msg);
  exec("git add README.md");
  exec(`git commit -m "init"`);

  // Replace the target branch with this orphan
  try {
    exec(`git branch -D ${branch}`);
  } catch {
    // Branch may not exist yet on first run, that is fine
  }
  exec(`git branch -m ${branch}`);

  // Force-push
  console.log(`Force-pushing to origin/${branch}...`);
  try {
    exec(`git push origin ${branch} --force`);
    console.log("\nDone! Contribution graph will clear within a few minutes.");
    console.log("You can now run generate.js + commit.js to draw a new pattern.");
  } catch (e) {
    console.error("Push failed:", e.message);
    console.log(`Manually run: cd "${absRepo}" && git push origin ${branch} --force`);
  }
}
