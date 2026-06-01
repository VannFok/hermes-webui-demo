import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const rootDir = resolve(import.meta.dirname, "..");

test("WebUI defaults to the fast interaction profile", async () => {
  const [appJs, indexHtml] = await Promise.all([
    readFile(resolve(rootDir, "app.js"), "utf8"),
    readFile(resolve(rootDir, "index.html"), "utf8")
  ]);

  assert.match(appJs, /setQuality\("fast"\)/);
  assert.match(indexHtml, /styles\.css\?v=[^"]*fast-interaction-/);
  assert.match(indexHtml, /app\.js\?v=[^"]*fast-interaction-/);
});

test("composer opens without timer-based focus lag", async () => {
  const appJs = await readFile(resolve(rootDir, "app.js"), "utf8");
  const openReplyComposer = appJs.match(/function openReplyComposer\([\s\S]*?\n  function openAgentComposer/);
  const openAgentComposer = appJs.match(/function openAgentComposer\([\s\S]*?\n  function closeReplyComposer/);

  assert.ok(openReplyComposer);
  assert.ok(openAgentComposer);
  assert.doesNotMatch(openReplyComposer[0], /setTimeout\(\(\) => \{\s*replyInput\.focus/);
  assert.doesNotMatch(openAgentComposer[0], /setTimeout\(\(\) => \{\s*replyInput\.focus/);
  assert.match(appJs, /function focusReplyInputSoon\(/);
  assert.match(appJs, /function scheduleBubbleReposition\(/);
});

test("fast profile removes expensive live filters from primary UI surfaces", async () => {
  const stylesCss = await readFile(resolve(rootDir, "styles.css"), "utf8");

  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.hud-top[\s\S]*?backdrop-filter:\s*none/);
  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.reply-shell[\s\S]*?backdrop-filter:\s*none/);
  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.message-bubble[\s\S]*?backdrop-filter:\s*none/);
  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.chip-dock[\s\S]*?backdrop-filter:\s*none/);
  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.reply-shell::after[\s\S]*?animation:\s*none/);
  assert.match(stylesCss, /body\[data-quality="fast"\]\s+\.reply-composer[\s\S]*?transition:\s*opacity 0\.1s ease,\s*transform 0\.14s/);
});
