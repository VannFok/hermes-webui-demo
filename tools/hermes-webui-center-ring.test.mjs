import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const rootDir = resolve(import.meta.dirname, "..");

test("center ring rotor overlay is wired to the LightPillar background", async () => {
  const indexHtml = await readFile(resolve(rootDir, "index.html"), "utf8");

  assert.match(indexHtml, /class="center-ring-rotor"/);
  assert.match(indexHtml, /viewBox="0 0 1680 944"/);
  assert.match(indexHtml, /class="center-ring-device center-ring-device--agent-01"/);
  assert.match(indexHtml, /class="center-ring-device center-ring-device--agent-02"/);
  assert.match(indexHtml, /class="center-ring-device center-ring-device--agent-03"/);
  assert.match(indexHtml, /class="center-ring-device center-ring-device--agent-04"/);
  assert.match(indexHtml, /class="center-ring-slot/);
  assert.match(indexHtml, /class="center-ring-lamp/);
  assert.match(indexHtml, /class="center-ring-core/);
  assert.match(indexHtml, /class="center-ring-sweep/);
  assert.match(indexHtml, /A 176 176/);
  assert.match(indexHtml, /A 194 194/);
  assert.match(indexHtml, /A 212 212/);
  assert.match(indexHtml, /A 230 230/);
  assert.doesNotMatch(indexHtml, /A 218 218/);
  assert.doesNotMatch(indexHtml, /A 292 292/);
  assert.match(indexHtml, /cx="840"/);
  assert.match(indexHtml, /cy="472"/);
  assert.match(indexHtml, /LightPillar\.css\?v=[^"]+/);
});

test("center ring typing animation stays CSS-only and compositor friendly", async () => {
  const lightPillarCss = await readFile(resolve(rootDir, "LightPillar.css"), "utf8");
  const packageJson = await readFile(resolve(rootDir, "package.json"), "utf8");
  const lampBlock = lightPillarCss.match(/\.center-ring-lamp\s*{[^}]*}/)?.[0] || "";
  const coreBlock = lightPillarCss.match(/\.center-ring-core\s*{[^}]*}/)?.[0] || "";
  const sweepBlock = lightPillarCss.match(/\.center-ring-sweep\s*{[^}]*}/)?.[0] || "";

  assert.match(lightPillarCss, /\.center-ring-rotor/);
  assert.match(lightPillarCss, /\.center-ring-rotor\s*{[\s\S]*?shape-rendering:\s*optimizeSpeed/);
  assert.match(lightPillarCss, /\.center-ring-device/);
  assert.match(lightPillarCss, /--ring-agent-01:\s*#43f7ff/);
  assert.match(lightPillarCss, /--ring-agent-02:\s*#a76cff/);
  assert.match(lightPillarCss, /--ring-agent-03:\s*#6dffb5/);
  assert.match(lightPillarCss, /--ring-agent-04:\s*#ffd166/);
  assert.match(lightPillarCss, /\.center-ring-slot/);
  assert.match(lightPillarCss, /\.center-ring-lamp/);
  assert.match(lightPillarCss, /\.center-ring-core/);
  assert.match(lightPillarCss, /\.center-ring-device--agent-01/);
  assert.match(lightPillarCss, /\.center-ring-device--agent-02/);
  assert.match(lightPillarCss, /\.center-ring-device--agent-03/);
  assert.match(lightPillarCss, /\.center-ring-device--agent-04/);
  assert.match(lightPillarCss, /#lightPillar\.is-thinking-agent-01\s+\.center-ring-device--agent-01/);
  assert.match(lightPillarCss, /#lightPillar\.is-thinking-agent-02\s+\.center-ring-device--agent-02/);
  assert.match(lightPillarCss, /#lightPillar\.is-thinking-agent-03\s+\.center-ring-device--agent-03/);
  assert.match(lightPillarCss, /#lightPillar\.is-thinking-agent-04\s+\.center-ring-device--agent-04/);
  assert.match(lightPillarCss, /stroke-linecap:\s*butt/);
  assert.match(lightPillarCss, /\.center-ring-slot\s*{[\s\S]*?stroke-width:\s*7px/);
  assert.match(lightPillarCss, /\.center-ring-lamp\s*{[\s\S]*?stroke-width:\s*4px/);
  assert.match(lightPillarCss, /\.center-ring-core\s*{[\s\S]*?stroke-width:\s*1\.5px/);
  assert.match(lightPillarCss, /\.center-ring-sweep\s*{[\s\S]*?stroke-width:\s*2px/);
  assert.doesNotMatch(lightPillarCss, /\.center-ring-slot[\s\S]{0,220}stroke-linecap:\s*round/);
  assert.doesNotMatch(lightPillarCss, /\.center-ring-lamp[\s\S]{0,220}stroke-linecap:\s*round/);
  assert.match(lightPillarCss, /centerRingSpinClockwise\s+14s/);
  assert.match(lightPillarCss, /centerRingSpinCounter\s+11\.8s/);
  assert.match(lightPillarCss, /centerRingSpinClockwise\s+16\.5s/);
  assert.match(lightPillarCss, /centerRingSpinCounter\s+13\.2s/);
  assert.match(lightPillarCss, /transform/);
  assert.match(lightPillarCss, /opacity/);
  assert.doesNotMatch(lightPillarCss, /centerRingLampBloom/);
  assert.doesNotMatch(lightPillarCss, /centerRingSweep/);
  assert.doesNotMatch(lampBlock, /filter:/);
  assert.doesNotMatch(sweepBlock, /filter:/);
  assert.doesNotMatch(lampBlock, /mix-blend-mode:/);
  assert.doesNotMatch(coreBlock, /mix-blend-mode:/);
  assert.doesNotMatch(sweepBlock, /mix-blend-mode:/);
  assert.doesNotMatch(sweepBlock, /stroke-dashoffset/);
  assert.match(lightPillarCss, /#lightPillar\.is-thinking\s+\.circuit-pulse\s+path[\s\S]*?animation-play-state:\s*paused/);
  assert.doesNotMatch(packageJson, /"gsap"/);
});

test("center ring follows real typing state instead of composer display state", async () => {
  const appJs = await readFile(resolve(rootDir, "app.js"), "utf8");
  const pushAgentMessage = appJs.match(/function pushAgentMessage\([\s\S]*?\n  function isCronMessageInput/);
  const openAgentComposer = appJs.match(/function openAgentComposer\([\s\S]*?\n  function closeReplyComposer/);
  const closeReplyComposer = appJs.match(/function closeReplyComposer\([\s\S]*?\n  function sendReply/);
  const showNextMessage = appJs.match(/function showNextMessage\([\s\S]*?\n  function positionBubbleAtCenter/);
  const setTypingAgent = appJs.match(/function setTypingAgent\([\s\S]*?\n  function clearTypingAgent/);
  const finishClearTypingAgent = appJs.match(/function finishClearTypingAgent\([\s\S]*?\n  function syncTypingAgentDots/);
  const syncThinkingAgentFromTyping = appJs.match(/function syncThinkingAgentFromTyping\([\s\S]*?\n  function flashAgentClick/);

  assert.ok(pushAgentMessage);
  assert.ok(openAgentComposer);
  assert.ok(closeReplyComposer);
  assert.ok(showNextMessage);
  assert.ok(setTypingAgent);
  assert.ok(finishClearTypingAgent);
  assert.ok(syncThinkingAgentFromTyping);

  assert.match(pushAgentMessage[0], /clearTypingAgent\(agent\.id,\s*{\s*immediate:\s*true\s*}\)/);
  assert.doesNotMatch(openAgentComposer[0], /setThinkingAgent\(/);
  assert.doesNotMatch(closeReplyComposer[0], /setThinkingAgent\(/);
  assert.doesNotMatch(showNextMessage[0], /setThinkingAgent\(/);
  assert.match(setTypingAgent[0], /syncThinkingAgentFromTyping\(\)/);
  assert.match(finishClearTypingAgent[0], /syncThinkingAgentFromTyping\(\)/);
  assert.match(syncThinkingAgentFromTyping[0], /`is-thinking-\$\{agent\.id\}`/);
  assert.match(syncThinkingAgentFromTyping[0], /classList\.toggle\("is-thinking",\s*hasThinkingAgent\)/);
});
