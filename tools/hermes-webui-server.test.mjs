import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { createHermesBridgeServer, loadAgentConfig, resolveAgent } from "./hermes-webui-server.mjs";

let server;
let baseUrl;
const __dirname = dirname(fileURLToPath(import.meta.url));
const historyPath = resolve(__dirname, "..", ".tmp-hermes-webui-history.test.json");
const eventLogPath = resolve(__dirname, "..", ".tmp-hermes-webui-events.test.ndjson");
const cronJobsPath = resolve(__dirname, "..", ".tmp-hermes-webui-cron-jobs.test.json");

async function readEventLog() {
  try {
    const raw = await readFile(eventLogPath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function waitForSseEvent(eventName, action) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/events`, { signal: controller.signal });
  assert.equal(response.status, 200);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    await action();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(`event: ${eventName}\n`)) return buffer;
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader.cancel().catch(() => {});
  }

  assert.fail(`missing SSE event: ${eventName}`);
}

before(async () => {
  const agents = await loadAgentConfig();
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });
  await rm(cronJobsPath, { force: true });
  server = createHermesBridgeServer({ agents, rootDir: new URL("../", import.meta.url), historyPath, eventLogPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });
  await rm(cronJobsPath, { force: true });
});

test("resolves the four Hermes agents by id, name, and alias", async () => {
  const agents = await loadAgentConfig();

  assert.equal(resolveAgent(agents, { agentId: "agent-01" }).name, "HermesFox");
  assert.equal(resolveAgent(agents, { agentName: "Hermies" }).id, "agent-02");
  assert.equal(resolveAgent(agents, { agent: "bf" }).id, "agent-03");
  assert.equal(resolveAgent(agents, { agent: "deercare" }).id, "agent-04");
});

test("accepts a Hermes message for a specific agent", async () => {
  const response = await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "live hello" })
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.agentId, "agent-01");
  assert.equal(body.message.agentName, "HermesFox");
});

test("accepts Telegram-sourced messages for the matching WebUI agent", async () => {
  const response = await fetch(`${baseUrl}/api/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "BF", text: "telegram hello" })
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.agentId, "agent-03");
  assert.equal(body.message.source, "telegram");
});

test("broadcasts Telegram-sourced messages to the browser event stream", async () => {
  const eventText = await waitForSseEvent("telegram_message", async () => {
    const response = await fetch(`${baseUrl}/api/telegram`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "HermesFox", text: "telegram stream hello" })
    });
    assert.equal(response.status, 202);
  });

  assert.match(eventText, /telegram stream hello/);
  assert.match(eventText, /"agentId":"agent-01"/);
});

test("accepts cron messages without routing them as normal input", async () => {
  const response = await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "deercare", message: "nightly check complete" })
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.agentId, "agent-04");
  assert.equal(body.message.kind, "cron");
  assert.equal(body.message.tone, "cron");
  assert.equal(body.message.cronType, "reminder");
});

test("accepts cron task results separately from regular agent messages", async () => {
  await rm(eventLogPath, { force: true });

  const response = await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent: "Hermies",
      text: "article draft complete",
      cronType: "task",
      jobId: "daily-writing",
      title: "Daily writing",
      taskStatus: "completed"
    })
  });

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.message.cronType, "task");
  assert.equal(body.message.jobId, "daily-writing");
  assert.equal(body.message.title, "Daily writing");
  assert.equal(body.message.taskStatus, "completed");

  const historyResponse = await fetch(`${baseUrl}/api/history`);
  const historyBody = await historyResponse.json();
  assert.equal(historyBody.history["agent-02"].some((message) => message.text === "article draft complete"), false);

  const cronResponse = await fetch(`${baseUrl}/api/cron/history?limit=5`);
  const cronBody = await cronResponse.json();
  assert.equal(cronBody.messages[0].cronType, "task");
  assert.equal(cronBody.messages[0].jobId, "daily-writing");
});

test("persists the latest three regular messages per agent", async () => {
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });

  for (const text of ["one", "two", "three", "four"]) {
    const response = await fetch(`${baseUrl}/api/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "HermesFox", text })
    });
    assert.equal(response.status, 202);
  }

  const telegramResponse = await fetch(`${baseUrl}/api/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "BF", text: "telegram saved" })
  });
  assert.equal(telegramResponse.status, 202);

  const cronResponse = await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "cron hidden" })
  });
  assert.equal(cronResponse.status, 202);

  const historyResponse = await fetch(`${baseUrl}/api/history`);
  assert.equal(historyResponse.status, 200);
  const body = await historyResponse.json();

  assert.deepEqual(body.history["agent-01"].map((message) => message.text), ["four", "three", "two"]);
  assert.equal(body.history["agent-03"][0].text, "telegram saved");
  assert.equal(body.history["agent-01"].some((message) => message.text === "cron hidden"), false);
});

test("separates user-facing history from complete event log", async () => {
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });

  const testResponse = await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "test payload", source: "test" })
  });
  assert.equal(testResponse.status, 202);
  const testBody = await testResponse.json();
  assert.equal(testBody.message.source, "test");
  assert.equal(testBody.message.persist, false);

  const systemResponse = await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "system notice", source: "system" })
  });
  assert.equal(systemResponse.status, 202);
  const systemBody = await systemResponse.json();
  assert.equal(systemBody.message.persist, false);

  const telegramResponse = await fetch(`${baseUrl}/api/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "telegram visible" })
  });
  assert.equal(telegramResponse.status, 202);
  const telegramBody = await telegramResponse.json();
  assert.equal(telegramBody.message.persist, true);

  const cronResponse = await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "cron logged" })
  });
  assert.equal(cronResponse.status, 202);
  const cronBody = await cronResponse.json();
  assert.equal(cronBody.message.persist, false);

  const historyResponse = await fetch(`${baseUrl}/api/history`);
  const historyBody = await historyResponse.json();
  assert.deepEqual(historyBody.history["agent-01"].map((message) => message.text), ["telegram visible"]);

  const events = await readEventLog();
  assert.deepEqual(events.map((event) => event.text), ["test payload", "system notice", "telegram visible", "cron logged"]);
  assert.deepEqual(events.map((event) => event.source), ["test", "system", "telegram", "cron"]);
});

test("serves searchable full history from user-facing event log entries", async () => {
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });

  const day = "2026-05-31";
  await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "web follow up", timestamp: `${day}T01:00:00.000Z` })
  });
  await fetch(`${baseUrl}/api/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "telegram visible note", timestamp: `${day}T02:00:00.000Z` })
  });
  await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "Hermies", text: "other agent note", timestamp: `${day}T03:00:00.000Z` })
  });
  await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "test hidden note", source: "test", timestamp: `${day}T04:00:00.000Z` })
  });
  await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "cron hidden note", timestamp: `${day}T05:00:00.000Z` })
  });

  const response = await fetch(`${baseUrl}/api/history/full?agentId=agent-01&q=note&source=telegram&date=${day}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.messages.map((message) => message.text), ["telegram visible note"]);
  await fetch(`${baseUrl}/api/outbox?drain=1`);
});

test("broadcasts cron messages to the browser event stream", async () => {
  const eventText = await waitForSseEvent("cron_message", async () => {
    const response = await fetch(`${baseUrl}/api/cron`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "deercare", text: "cron stream complete" })
    });
    assert.equal(response.status, 202);
  });

  assert.match(eventText, /cron stream complete/);
  assert.match(eventText, /"kind":"cron"/);
});

test("serves recent cron history separately from normal history", async () => {
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });

  await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "HermesFox", text: "normal hidden from cron" })
  });
  await fetch(`${baseUrl}/api/cron`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "BF", text: "cron inbox item" })
  });

  const response = await fetch(`${baseUrl}/api/cron/history?limit=5`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.messages.map((message) => message.text), ["cron inbox item"]);
  assert.equal(body.messages[0].agentId, "agent-03");
});

test("stores WebUI input for Hermes to drain", async () => {
  const sendResponse = await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "agent-03", text: "build this" })
  });

  assert.equal(sendResponse.status, 202);

  const outboxResponse = await fetch(`${baseUrl}/api/outbox?drain=1`);
  assert.equal(outboxResponse.status, 200);
  const outbox = await outboxResponse.json();
  assert.equal(outbox.messages.length, 1);
  assert.equal(outbox.messages[0].agentId, "agent-03");
  assert.equal(outbox.messages[0].text, "build this");

  const emptyResponse = await fetch(`${baseUrl}/api/outbox?drain=1`);
  const empty = await emptyResponse.json();
  assert.deepEqual(empty.messages, []);
});

test("stores reply context with WebUI input", async () => {
  const sendResponse = await fetch(`${baseUrl}/api/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentId: "agent-02",
      text: "continue from this",
      messageId: "hermes-old-2",
      replyToText: "previous task state",
      replyToTimestamp: "2026-05-31T08:00:00.000Z",
      mode: "reply"
    })
  });

  assert.equal(sendResponse.status, 202);

  const outboxResponse = await fetch(`${baseUrl}/api/outbox?drain=1`);
  assert.equal(outboxResponse.status, 200);
  const outbox = await outboxResponse.json();
  assert.equal(outbox.messages.length, 1);
  assert.equal(outbox.messages[0].messageId, "hermes-old-2");
  assert.equal(outbox.messages[0].replyToText, "previous task state");
  assert.equal(outbox.messages[0].replyToTimestamp, "2026-05-31T08:00:00.000Z");
  assert.equal(outbox.messages[0].mode, "reply");
});

test("schedules enabled cron task jobs into the Hermes outbox", async () => {
  const agents = await loadAgentConfig();
  await writeFile(
    cronJobsPath,
    `${JSON.stringify({
      jobs: [
        {
          id: "daily-writing",
          enabled: true,
          type: "task",
          agent: "Hermies",
          schedule: { intervalMinutes: 0.001 },
          title: "Daily writing",
          prompt: "write the daily article"
        }
      ]
    })}\n`,
    "utf8"
  );

  const scheduledServer = createHermesBridgeServer({
    agents,
    rootDir: new URL("../", import.meta.url),
    historyPath,
    eventLogPath,
    cronJobsPath
  });

  await new Promise((resolve) => scheduledServer.listen(0, "127.0.0.1", resolve));
  try {
    await scheduledServer.startCronScheduler();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const { port } = scheduledServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/outbox?drain=1`);
    const body = await response.json();
    assert.ok(body.messages.length >= 1);
    assert.equal(body.messages[0].agentId, "agent-02");
    assert.equal(body.messages[0].kind, "cron_task");
    assert.equal(body.messages[0].cronType, "task");
    assert.equal(body.messages[0].jobId, "daily-writing");
    assert.equal(body.messages[0].sessionName, "hermes-webui-cron-daily-writing");
  } finally {
    scheduledServer.stopCronScheduler();
    await new Promise((resolve) => scheduledServer.close(resolve));
    await rm(cronJobsPath, { force: true });
  }
});
