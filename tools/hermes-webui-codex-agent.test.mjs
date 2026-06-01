import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCodexArgs, buildCodexPrompt, resolveAgentProfile } from "./hermes-webui-codex-agent.mjs";

test("builds a HermesFox prompt from WebUI input", () => {
  const prompt = buildCodexPrompt({
    agentId: "agent-01",
    agentName: "HermesFox",
    text: "检查状态"
  });

  assert.match(prompt, /HermesFox/);
  assert.match(prompt, /检查状态/);
  assert.match(prompt, /请用中文回复用户/);
});

test("includes quoted reply context in Codex prompt", () => {
  const prompt = buildCodexPrompt({
    agentId: "agent-03",
    agentName: "BF",
    text: "continue",
    replyToText: "previous status",
    replyToTimestamp: "2026-05-31T08:00:00.000Z"
  });

  assert.match(prompt, /Quoted message context:/);
  assert.match(prompt, /previous status/);
  assert.match(prompt, /continue/);
});

test("resolves all four WebUI agent profiles", () => {
  assert.equal(resolveAgentProfile("agent-01").name, "HermesFox");
  assert.equal(resolveAgentProfile("agent-02").name, "Hermies");
  assert.equal(resolveAgentProfile("agent-03").name, "BF");
  assert.equal(resolveAgentProfile("agent-04").name, "deercare");
});

test("uses codex exec with output capture", () => {
  const args = buildCodexArgs("hello", "last-message.txt");

  assert.equal(args[0], "exec");
  assert.ok(args.includes("--output-last-message"));
  assert.ok(args.includes("last-message.txt"));
  assert.equal(args.at(-1), "hello");
});
