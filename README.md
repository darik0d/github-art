# GitHub ASCII Art Generator

This is the **generator repo**: it holds the scripts that produce and push art to GitHub's contribution graph.

> The **scratch repo** (`github-art-scratch` or whatever you named it) is a separate empty repository that exists only to receive backdated commits. See [Setup](#setup) below.

---

## How it works

GitHub's contribution graph is a rolling 53-column window (52 full past weeks + the current partial week), where each column is one week and each row is a day (row 0 = Sunday, row 6 = Saturday). The scripts generate backdated git commits in the scratch repo so that the pattern of green squares spells out your art.

The window is computed from today's date at runtime. Running `clean.js` + `generate.js` + `commit.js` each week keeps the art looking sharp as old columns scroll off the left edge.

---

## Files

| File | Purpose |
|---|---|
| `generate.js` | Converts a PNG, JSON grid, or text into a commit schedule (`commits.json`) |
| `commit.js` | Replays that schedule as backdated git commits in the scratch repo |
| `clean.js` | Wipes the scratch repo's history so you can redraw from scratch |
| `example-pattern.json` | Example hand-drawn JSON pixel grid |

---

## Setup

### 1. Two repos, two purposes

| Repo | What it is | Should contain |
|---|---|---|
| **This repo** (generator) | The repo you're reading now | `generate.js`, `commit.js`, `clean.js` |
| **Scratch repo** (`github-art-scratch`) | A dedicated empty public repo on your GitHub account | Only what `commit.js` writes there |

Never run `commit.js` against a repo that has real code: it will pollute the history with hundreds of empty commits.

### 2. Create the scratch repo

Go to GitHub, create a new empty public repo (e.g. `github-art-scratch`), then clone it:

```bash
git clone https://github.com/YOURUSERNAME/github-art-scratch
```

Make sure git knows who you are: the email must match your GitHub account:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

### 3. Install dependencies

PNG support requires one native package:

```bash
npm install canvas
```

---

## Weekly workflow

Each week, old columns scroll off the left edge of the graph, so the art drifts. Run this sequence to reset and redraw:

```bash
# 1. Wipe the scratch repo
node clean.js --repo C:\path\to\github-art-scratch

# 2. Generate a fresh schedule from today's window
node generate.js --text "HELLO" --output commits.json
# or: node generate.js --png mylogo.png --output commits.json

# 3. Replay the commits
node commit.js --input commits.json --repo C:\path\to\github-art-scratch --push
```

If you are already inside the scratch repo folder, use `--repo .` instead of the full path.

---

## generate.js

```bash
node generate.js --text "HI" --output commits.json
node generate.js --png logo.png --output commits.json
node generate.js --json pattern.json --output commits.json
```

| Flag | Default | Description |
|---|---|---|
| `--png <file>` | | PNG image to use as the pattern |
| `--text <string>` | | Text rendered with the built-in 5x7 bitmap font |
| `--json <file>` | | Hand-drawn JSON pixel grid (see below) |
| `--output <file>` | `commits.json` | Where to write the schedule |
| `--intensity <n>` | `10` | Commits per lit cell (1-20). See intensity note below. |
| `--threshold <n>` | `128` | PNG only: luma cutoff for lit vs empty (0-255) |
| `--invert` | off | PNG only: treat bright pixels as lit instead of dark |

**Intensity note.** GitHub shades cells relative to your own average activity. If you commit regularly, cells with only 4-5 commits may not stand out at all. The default is 10; raise it further if the art looks faint. Check your graph's "Less / More" legend: you want the art cells to sit at the "More" end.

The pattern is automatically shifted down by 1 row (onto Monday) so it sits in the Mon-Fri band that GitHub labels and is clearly visible on your profile.

---

## commit.js

```bash
node commit.js --input commits.json --repo /path/to/github-art-scratch
```

| Flag | Default | Description |
|---|---|---|
| `--input <file>` | | Schedule JSON from `generate.js` |
| `--repo <path>` | | Local path to the scratch repo (not a URL) |
| `--dry-run` | | Print dates that would be committed, no changes made |
| `--push` | | Push automatically after committing |
| `--branch <name>` | `main` | Branch to push to |

---

## clean.js

Wipes all commit history in the scratch repo by orphaning the branch and force-pushing. Run this before redrawing.

```bash
node clean.js --repo /path/to/github-art-scratch
```

| Flag | Default | Description |
|---|---|---|
| `--repo <path>` | `.` | Local path to the scratch repo |
| `--branch <name>` | `main` | Branch to reset |
| `--dry-run` | | Show what would happen, no changes |

You will be asked to type `YES` before anything is destroyed.

---

## PNG tips

- Black (or any dark, opaque) pixels become lit cells; transparent or white pixels become empty.
- The image is automatically scaled to 53x7 using area-averaging.
- Use a wide banner-style image (roughly 7:1 aspect ratio): thin strokes look much cleaner than filled shapes at 7px tall.
- If the output looks noisy, lower `--threshold` (e.g. `--threshold 60`) to require darker pixels before they count as lit.
- For white-on-dark images, add `--invert`.

---

## Custom JSON pixel grids

```json
{
  "grid": [
    [0,1,1,0],
    [1,0,0,1],
    [1,0,0,1],
    [1,1,1,1],
    [1,0,0,1],
    [1,0,0,1],
    [1,0,0,1]
  ]
}
```

- Exactly **7 rows** (row 0 = Sunday at the top of the grid, row 6 = Saturday)
- Each row up to **53 columns** (one per week)
- `1` = commits, `0` = empty
- All rows must be the same length
- The pattern is centered horizontally and shifted 1 row down automatically

---

## Supported text characters

`A-Z`, `0-9`, and: `space ! ? . : < > / \`

Rendered in a 5x7 pixel bitmap font with a 1-column gap between letters.
