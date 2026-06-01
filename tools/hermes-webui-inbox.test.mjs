import assert from "node:assert/strict";
import { appendFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { startInboxRelay } from "./hermes-webui-inbox.mjs";
import { createHermesBridgeServer, loadAgentConfig } from "./hermes-webui-server.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inboxPath = resolve(__dirname, "..", ".tmp-hermes-webui-inbox-test.ndjson");
const historyPath = resolve(__dirname, "..", ".tmp-hermes-webui-inbox-history-test.json");
const eventLogPath = resolve(__dirname, "..", ".tmp-hermes-webui-inbox-events-test.ndjson");
let server;
let baseUrl;

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
  await writeFile(inboxPath, "", "utf8");
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });
  const agents = await loadAgentConfig();
  server = createHermesBridgeServer({ agents, rootDir: new URL("../", import.meta.url), historyPath, eventLogPath });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(inboxPath, { force: true });
  await rm(historyPath, { force: true });
  await rm(eventLogPath, { force: true });
});

test("relays inbox telegram lines to the browser event stream", async () => {
  const controller = new AbortController();
  const relay = await startInboxRelay({
    inbox: inboxPath,
    server: baseUrl,
    interval: 60_000,
    signal: controller.signal
  });

  try {
    const eventText = await waitForSseEvent("telegram_message", async () => {
      await appendFile(inboxPath, JSON.stringify({ agent: "HermesFox", text: "telegram inbox test", source: "test" }) + "\n", "utf8");
      await relay.drain();
    });

    assert.match(eventText, /telegram inbox test/);
    assert.match(eventText, /"agentId":"agent-01"/);
    assert.match(eventText, /"source":"test"/);
  } finally {
    controller.abort();
    relay.stop();
  }
});

test("relays inbox cron lines to the browser event stream", async () => {
  await writeFile(inboxPath, "", "utf8");
  const controller = new AbortController();
  const relay = await startInboxRelay({
    inbox: inboxPath,
    server: baseUrl,
    interval: 60_000,
    signal: controller.signal
  });

  try {
    const eventText = await waitForSseEvent("cron_message", async () => {
      await appendFile(inboxPath, JSON.stringify({ agent: "deercare", kind: "cron", text: "cron inbox done" }) + "\n", "utf8");
      await relay.drain();
    });

    assert.match(eventText, /cron inbox done/);
    assert.match(eventText, /"kind":"cron"/);
  } finally {
    controller.abort();
    relay.stop();
  }
});

test("relays existing inbox lines when the relay starts", async () => {
  await writeFile(
    inboxPath,
    JSON.stringify({
      agent: "Hermies",
      kind: "cron",
      cronType: "task",
      jobId: "daily-writing",
      title: "Daily writing",
      text: "existing cron result"
    }) + "\n",
    "utf8"
  );
  const controller = new AbortController();
  const relay = await startInboxRelay({
    inbox: inboxPath,
    server: baseUrl,
    interval: 60_000,
    signal: controller.signal
  });

  try {
    const eventText = await waitForSseEvent("cron_message", async () => {
      await relay.drain();
    });

    assert.match(eventText, /existing cron result/);
    assert.match(eventText, /"cronType":"task"/);
    assert.match(eventText, /"jobId":"daily-writing"/);
  } finally {
    controller.abort();
    relay.stop();
  }
});
