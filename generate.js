#!/usr/bin/env node
/**
 * GitHub ASCII Art Activity Grid Generator
 *
 * Converts a PNG, a JSON pixel grid, or rendered text into a schedule of Git
 * commits that will draw the image on your GitHub contribution graph.
 *
 * Usage:
 *   node generate.js --text "HI" --output commits.json
 *   node generate.js --png logo.png --output commits.json
 *   node generate.js --json pattern.json --output commits.json
 *
 * PNG tips:
 *   - Black (or any dark/opaque) pixels become lit cells.
 *   - Transparent or white pixels become empty cells.
 *   - The image is automatically scaled to fit 53 x 7.
 *   - Use --threshold 128 to tune the dark/light cutoff (0-255, default 128).
 *   - Use --invert if your image is white-on-dark instead of dark-on-light.
 *
 * Install the PNG dependency first (only needed for --png):
 *   npm install canvas
 *
 * Then replay the commits:
 *   node commit.js --input commits.json --repo /path/to/your/repo
 */

const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const has  = (flag) => args.includes(flag);

const inputPng     = get("--png");
const inputJson    = get("--json") || get("--image"); // --image kept for back-compat
const inputText    = get("--text");
const outputFile   = get("--output")    || "commits.json";
const intensityArg = get("--intensity") || "10";
const thresholdArg = get("--threshold") || "128";
const invertFlag   = has("--invert");

const INTENSITY = Math.max(1, Math.min(10, parseInt(intensityArg, 10)));
const THRESHOLD = Math.max(0, Math.min(255, parseInt(thresholdArg, 10)));

// ---------------------------------------------------------------------------
// GitHub contribution grid geometry
// ---------------------------------------------------------------------------
// GitHub shows a ROLLING window: the Sunday >= 52 weeks before today, up to
// and including the current week. That is 52 full columns + the partial
// current week = 53 columns total. The "extra cell" top-right that you see
// when today is not Saturday is simply the days-so-far in that last column.
// We model 53 columns and skip any commit dates that fall after today.
const COLS = 53;
const ROWS = 7;

function getGridStartDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0 = Sun
  const thisSunday = new Date(today);
  thisSunday.setDate(today.getDate() - dow);
  const start = new Date(thisSunday);
  start.setDate(thisSunday.getDate() - 52 * 7);
  return start;
}

function gridCellToDate(col, row) {
  const start = getGridStartDate();
  const d = new Date(start);
  d.setDate(start.getDate() + col * 7 + row);
  return d;
}

function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Built-in 5x7 pixel font (A-Z, 0-9, punctuation)
// Stored as arrays of 7 bitmasks (one per row), MSB = leftmost pixel.
// ---------------------------------------------------------------------------
const FONT = {
  " ": [0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00000],
  A:   [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  B:   [0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110],
  C:   [0b01111,0b10000,0b10000,0b10000,0b10000,0b10000,0b01111],
  D:   [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  E:   [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  F:   [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000],
  G:   [0b01111,0b10000,0b10000,0b10111,0b10001,0b10001,0b01111],
  H:   [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  I:   [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b11111],
  J:   [0b11111,0b00010,0b00010,0b00010,0b00010,0b10010,0b01100],
  K:   [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  L:   [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  M:   [0b10001,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001],
  N:   [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  O:   [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  P:   [0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000],
  Q:   [0b01110,0b10001,0b10001,0b10001,0b10101,0b10010,0b01101],
  R:   [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  S:   [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  T:   [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  U:   [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  V:   [0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b00100],
  W:   [0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001],
  X:   [0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001],
  Y:   [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100],
  Z:   [0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111],
  "0":[0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110],
  "1":[0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b11111],
  "2":[0b01110,0b10001,0b00001,0b00110,0b01000,0b10000,0b11111],
  "3":[0b11111,0b00001,0b00010,0b00110,0b00001,0b10001,0b01110],
  "4":[0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010],
  "5":[0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110],
  "6":[0b00110,0b01000,0b10000,0b11110,0b10001,0b10001,0b01110],
  "7":[0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
  "8":[0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110],
  "9":[0b01110,0b10001,0b10001,0b01111,0b00001,0b00010,0b01100],
  "!":[0b00100,0b00100,0b00100,0b00100,0b00100,0b00000,0b00100],
  "?":[0b01110,0b10001,0b00001,0b00110,0b00100,0b00000,0b00100],
  ".":[0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00100],
  ":":[0b00000,0b00100,0b00000,0b00000,0b00100,0b00000,0b00000],
  "<":[0b00001,0b00110,0b01100,0b10000,0b01100,0b00110,0b00001],
  ">":[0b10000,0b01100,0b00110,0b00001,0b00110,0b01100,0b10000],
  "/":[0b00001,0b00010,0b00100,0b01000,0b10000,0b00000,0b00000],
  "\\":[0b10000,0b01000,0b00100,0b00010,0b00001,0b00000,0b00000],
};

// ---------------------------------------------------------------------------
// Render text string to a 7-row pixel grid
// ---------------------------------------------------------------------------
function textToGrid(text) {
  const upper = text.toUpperCase();
  const grid  = Array.from({ length: ROWS }, () => []);
  for (let ci = 0; ci < upper.length; ci++) {
    const ch     = upper[ci];
    const bitmap = FONT[ch] || FONT[" "];
    for (let row = 0; row < ROWS; row++) {
      const bits = bitmap[row];
      for (let col = 4; col >= 0; col--) grid[row].push((bits >> col) & 1);
      if (ci < upper.length - 1) grid[row].push(0); // 1-col gap between chars
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Load a JSON pixel grid
// Format: { "grid": [[0,1,...], ...] }  (exactly 7 rows, up to 53 cols)
// ---------------------------------------------------------------------------
function loadJsonGrid(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw.grid || !Array.isArray(raw.grid)) {
    throw new Error("JSON must have a 'grid' key containing a 7-row array.");
  }
  if (raw.grid.length !== ROWS) {
    throw new Error(`JSON grid must have exactly ${ROWS} rows (got ${raw.grid.length}).`);
  }
  return raw.grid;
}

// ---------------------------------------------------------------------------
// Load a PNG and scale it down to a 7-row pixel grid
//
// How it works:
//   1. Load the PNG with the 'canvas' npm package (npm install canvas).
//   2. Draw it scaled to COLS x ROWS using drawImage — this gives free
//      area-averaging (anti-aliased downscale) from the browser-style 2D API.
//   3. For each output cell decide lit/empty based on two criteria:
//      a. Alpha >= 32  (skip near-transparent pixels regardless of colour)
//      b. Perceptual luma compared against --threshold
//         default (dark on light): lit when luma < threshold
//         --invert  (light on dark): lit when luma >= threshold
// ---------------------------------------------------------------------------
async function loadPngGrid(filePath, threshold, invert) {
  let createCanvas, loadImage;
  try {
    ({ createCanvas, loadImage } = require("canvas"));
  } catch {
    console.error(
      "\nERROR: The 'canvas' package is required for PNG support.\n" +
      "Install it with:  npm install canvas\n" +
      "Then re-run generate.js.\n"
    );
    process.exit(1);
  }

  const img    = await loadImage(filePath);
  console.log(`  PNG loaded: ${img.width} x ${img.height} px`);

  const canvas = createCanvas(COLS, ROWS);
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0, 0, COLS, ROWS);
  ctx.drawImage(img, 0, 0, COLS, ROWS);

  const { data } = ctx.getImageData(0, 0, COLS, ROWS); // RGBA flat array
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx   = (row * COLS + col) * 4;
      const alpha = data[idx + 3];

      // Near-transparent = always empty
      if (alpha < 32) { grid[row][col] = 0; continue; }

      // Perceptual luminance (ITU-R BT.601)
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      grid[row][col] = (invert ? luma >= threshold : luma < threshold) ? 1 : 0;
    }
  }

  return grid;
}

// Row 0 = Sunday. GitHub labels Mon/Wed/Fri, so the clearly visible band is
// rows 1-5. Shift the pattern down by 1 so letters sit in that band.
const ROW_OFFSET = 1;

// ---------------------------------------------------------------------------
// Convert a pixel grid to a schedule of commit dates
// ---------------------------------------------------------------------------
function gridToSchedule(pixelGrid) {
  const schedule   = [];
  const gridWidth  = pixelGrid[0].length;
  const gridHeight = pixelGrid.length;
  const startCol   = Math.max(0, Math.floor((COLS - gridWidth) / 2));
  const today      = getToday();
  let   skipped    = 0;

  for (let row = 0; row < gridHeight; row++) {
    const gridRow = row + ROW_OFFSET;
    if (gridRow >= ROWS) continue;
    for (let col = 0; col < gridWidth && (startCol + col) < COLS; col++) {
      if (!pixelGrid[row][col]) continue;
      const date = gridCellToDate(startCol + col, gridRow);
      if (date > today) { skipped++; continue; }
      for (let i = 0; i < INTENSITY; i++) {
        schedule.push({ date: date.toISOString().split("T")[0], col: startCol + col, row: gridRow });
      }
    }
  }

  if (skipped > 0) {
    console.warn(`  Warning: ${skipped} lit cell(s) fall in the future and were skipped.`);
    console.warn(`  Shift the pattern left or wait for those weeks to pass.`);
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const gridStart = getGridStartDate();
  const today     = getToday();
  console.log(`Grid window: ${gridStart.toISOString().split("T")[0]} → ${today.toISOString().split("T")[0]}`);

  let pixelGrid;

  if (inputPng) {
    console.log(`Loading PNG: ${inputPng}`);
    if (!fs.existsSync(inputPng)) { console.error(`File not found: ${inputPng}`); process.exit(1); }
    pixelGrid = await loadPngGrid(inputPng, THRESHOLD, invertFlag);
    console.log(`  Threshold: ${THRESHOLD},  Invert: ${invertFlag}`);
  } else if (inputJson) {
    console.log(`Loading JSON grid: ${inputJson}`);
    pixelGrid = loadJsonGrid(inputJson);
  } else if (inputText) {
    console.log(`Rendering text: "${inputText}"`);
    pixelGrid = textToGrid(inputText);
  } else {
    console.log('No input provided. Rendering default: "HI"');
    pixelGrid = textToGrid("HI");
  }

  // Terminal preview
  console.log(`\nPreview (${pixelGrid[0].length} cols x ${ROWS} rows):`);
  for (let row = 0; row < ROWS; row++) {
    console.log(pixelGrid[row].map((v) => (v ? "██" : "  ")).join(""));
  }

  const schedule = gridToSchedule(pixelGrid);
  console.log(`\nGenerated ${schedule.length} commit entries`);
  console.log(`Intensity: ${INTENSITY} commits per lit cell`);

  fs.writeFileSync(
    outputFile,
    JSON.stringify({ gridStart: gridStart.toISOString().split("T")[0], commits: schedule }, null, 2)
  );
  console.log(`\nSchedule saved to: ${outputFile}`);
  console.log(`Next step: node commit.js --input ${outputFile} --repo /path/to/your/repo`);
}

main().catch((err) => { console.error(err); process.exit(1); });
