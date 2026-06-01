import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const rootDir = resolve(import.meta.dirname, "..");

test("startup agent entrance is wired without a runtime animation dependency", async () => {
  const [appJs, stylesCss] = await Promise.all([
    readFile(resolve(rootDir, "app.js"), "utf8"),
    readFile(resolve(rootDir, "styles.css"), "utf8")
  ]);

  assert.match(appJs, /function runStartupAgentEntrance\(\)/);
  assert.match(appJs, /runStartupAgentEntrance\(\);/);
  assert.match(appJs, /"agent-01",\s*"agent-02",\s*"agent-03",\s*"agent-04"/s);
  assert.match(appJs, /is-startup-entering/);
  assert.match(appJs, /playStartupEntranceSound\(\)/);
  assert.match(appJs, /flashAgentClick\(agentId\)/);
  assert.doesNotMatch(appJs, /from ["']gsap["']/);

  assert.match(stylesCss, /\.agent-dot\.is-startup-entering/);
  assert.match(stylesCss, /will-change:\s*transform,\s*opacity/);
});

test("startup entrance assets are cache-busted from index", async () => {
  const indexHtml = await readFile(resolve(rootDir, "index.html"), "utf8");

  assert.match(indexHtml, /styles\.css\?v=startup-agent-entrance-/);
  assert.match(indexHtml, /app\.js\?v=startup-agent-(?:entrance|audio)-/);
});

test("startup entrance has a queued mechanical sound cue", async () => {
  const [appJs, indexHtml] = await Promise.all([
    readFile(resolve(rootDir, "app.js"), "utf8"),
    readFile(resolve(rootDir, "index.html"), "utf8")
  ]);

  assert.match(appJs, /pendingStartupSound/);
  assert.match(appJs, /function playStartupEntranceSound\(/);
  assert.match(appJs, /function playMechanicalNoiseBurst\(/);
  assert.match(appJs, /flushQueuedSound\(\)/);
  assert.match(appJs, /allowQueue/);
  assert.match(indexHtml, /app\.js\?v=startup-agent-audio-/);
});
