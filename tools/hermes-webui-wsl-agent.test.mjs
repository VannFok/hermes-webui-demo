import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildHermesChatCommand,
  buildHermesInput,
  buildWslArgs,
  resolveHermesProfile,
  resolveHermesSessionName,
  stripHermesTerminalNoise,
  summarizeHermesError
} from "./hermes-webui-wsl-agent.mjs";

test("maps WebUI agents to WSL Hermes profiles", () => {
  assert.equal(resolveHermesProfile({ agentId: "agent-01" }), "default");
  assert.equal(resolveHermesProfile({ agentId: "agent-02" }), "hermies");
  assert.equal(resolveHermesProfile({ agentId: "agent-03" }), "bf");
  assert.equal(resolveHermesProfile({ agentId: "agent-04" }), "deercare");
});

test("builds a WSL bash command for Hermes chat", () => {
  const command = buildHermesChatCommand("bf", "你好", "hermes-webui-agent-03");

  assert.match(command, /\/home\/raindy\/\.hermes\/hermes-agent/);
  assert.match(command, /hermes -p 'bf' --continue 'hermes-webui-agent-03' -z '你好' chat/);
});

test("builds WSL args using the configured distro", () => {
  assert.deepEqual(buildWslArgs("Ubuntu", "hermies", "ping", "hermes-webui-agent-02"), [
    "-d",
    "Ubuntu",
    "--",
    "bash",
    "-lc",
    buildHermesChatCommand("hermies", "ping", "hermes-webui-agent-02")
  ]);
});

test("uses a stable Hermes session name per WebUI agent", () => {
  assert.equal(resolveHermesSessionName({ agentId: "agent-01" }, "default"), "hermes-webui-agent-01");
  assert.equal(resolveHermesSessionName({ agentId: "agent-03" }, "bf"), "hermes-webui-agent-03");
});

test("uses an isolated Hermes session name for cron task jobs", () => {
  assert.equal(
    resolveHermesSessionName({ agentId: "agent-02", cronType: "task", jobId: "daily-writing" }, "hermies"),
    "hermes-webui-cron-daily-writing"
  );
});

test("prepends cron task context for WSL Hermes input", () => {
  const input = buildHermesInput({
    text: "write the daily article",
    cronType: "task",
    jobId: "daily-writing",
    title: "Daily writing"
  });

  assert.match(input, /Cron task:/);
  assert.match(input, /Title: Daily writing/);
  assert.match(input, /Job: daily-writing/);
  assert.match(input, /User task:\nwrite the daily article/);
});

test("prepends quoted reply context for WSL Hermes input", () => {
  const input = buildHermesInput({
    text: "continue",
    replyToText: "previous status",
    replyToTimestamp: "2026-05-31T08:00:00.000Z"
  });

  assert.match(input, /Reply context:/);
  assert.match(input, /previous status/);
  assert.match(input, /User task:\ncontinue/);
});

test("strips interactive Hermes banner and tool list noise", () => {
  const cleaned = stripHermesTerminalNoise(`
╭──── Hermes Agent v0.14.0 · upstream 12c39830 ────╮ | Available Tools |
browser: browser_back, browser_click, | |
code_execution: execute_code | |
真正回复：你好，我在。
`);

  assert.equal(cleaned, "真正回复：你好，我在。");
});

test("summarizes Hermes argparse usage noise", () => {
  const summary = summarizeHermesError(`
usage: hermes [-h] [-z PROMPT] {chat,model}
hermes: error: unrecognized arguments: hi
`);

  assert.equal(summary, "hermes: error: unrecognized arguments: hi");
});

