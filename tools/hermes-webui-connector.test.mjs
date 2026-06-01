import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAgentEnvironment,
  handleMessage,
  loadCommandConfig,
  parseArgs,
  selectCommandForAgent
} from "./hermes-webui-connector.mjs";

const message = {
  id: "webui-1",
  agentId: "agent-03",
  agentName: "BF",
  text: "please build",
  mode: "agent",
  timestamp: "2026-05-30T00:00:00.000Z"
};

const emptyCronEnv = {
  HERMES_WEBUI_CRON_TYPE: "",
  HERMES_WEBUI_CRON_JOB_ID: "",
  HERMES_WEBUI_CRON_TITLE: "",
  HERMES_WEBUI_SESSION_NAME: ""
};

test("selects a command by agent id before falling back to default", () => {
  const commands = {
    default: { command: "default", args: [] },
    "agent-03": { command: "bf", args: ["run"] }
  };

  assert.deepEqual(selectCommandForAgent(commands, message), { command: "bf", args: ["run"] });
  assert.deepEqual(selectCommandForAgent(commands, { ...message, agentId: "agent-99" }), {
    command: "default",
    args: []
  });
});

test("builds a stable environment for Hermes child processes", () => {
  assert.deepEqual(buildAgentEnvironment(message), {
    HERMES_WEBUI_MESSAGE_ID: "webui-1",
    HERMES_WEBUI_AGENT_ID: "agent-03",
    HERMES_WEBUI_AGENT_NAME: "BF",
    HERMES_WEBUI_INPUT_TEXT: "please build",
    HERMES_WEBUI_INPUT_MODE: "agent",
    HERMES_WEBUI_REPLY_TO_MESSAGE_ID: "",
    HERMES_WEBUI_REPLY_TO_TEXT: "",
    HERMES_WEBUI_REPLY_TO_TIMESTAMP: "",
    ...emptyCronEnv
  });
});

test("passes quoted reply context to Hermes child processes", () => {
  assert.deepEqual(
    buildAgentEnvironment({
      ...message,
      messageId: "hermes-previous",
      replyToText: "previous context",
      replyToTimestamp: "2026-05-31T08:00:00.000Z",
      mode: "reply"
    }),
    {
      HERMES_WEBUI_MESSAGE_ID: "webui-1",
      HERMES_WEBUI_AGENT_ID: "agent-03",
      HERMES_WEBUI_AGENT_NAME: "BF",
      HERMES_WEBUI_INPUT_TEXT: "please build",
      HERMES_WEBUI_INPUT_MODE: "reply",
      HERMES_WEBUI_REPLY_TO_MESSAGE_ID: "hermes-previous",
      HERMES_WEBUI_REPLY_TO_TEXT: "previous context",
      HERMES_WEBUI_REPLY_TO_TIMESTAMP: "2026-05-31T08:00:00.000Z",
      ...emptyCronEnv
    }
  );
});

test("passes cron task metadata to Hermes child processes", () => {
  assert.deepEqual(
    buildAgentEnvironment({
      ...message,
      kind: "cron_task",
      cronType: "task",
      jobId: "daily-writing",
      title: "Daily writing",
      sessionName: "hermes-webui-cron-daily-writing"
    }),
    {
      HERMES_WEBUI_MESSAGE_ID: "webui-1",
      HERMES_WEBUI_AGENT_ID: "agent-03",
      HERMES_WEBUI_AGENT_NAME: "BF",
      HERMES_WEBUI_INPUT_TEXT: "please build",
      HERMES_WEBUI_INPUT_MODE: "agent",
      HERMES_WEBUI_REPLY_TO_MESSAGE_ID: "",
      HERMES_WEBUI_REPLY_TO_TEXT: "",
      HERMES_WEBUI_REPLY_TO_TIMESTAMP: "",
      HERMES_WEBUI_CRON_TYPE: "task",
      HERMES_WEBUI_CRON_JOB_ID: "daily-writing",
      HERMES_WEBUI_CRON_TITLE: "Daily writing",
      HERMES_WEBUI_SESSION_NAME: "hermes-webui-cron-daily-writing"
    }
  );
});

test("defaults to the local Hermes command config for one-command startup", async () => {
  assert.equal(parseArgs([]).commands, "hermes-agent-commands.json");
  assert.deepEqual(await loadCommandConfig("missing-hermes-agent-commands.json"), { commands: {} });
});

test("posts setup feedback when an agent has no Hermes command", async () => {
  const posted = [];
  const logger = { log() {}, error() {} };

  await handleMessage("http://127.0.0.1:4173", {}, message, {
    logger,
    postMessage: async (serverUrl, payload) => {
      posted.push({ serverUrl, payload });
    }
  });

  assert.equal(posted.length, 1);
  assert.equal(posted[0].payload.agentId, "agent-03");
  assert.equal(posted[0].payload.tone, "setup");
  assert.match(posted[0].payload.text, /Hermes/);
});

test("posts cron task command results back to the cron endpoint", async () => {
  const postedMessages = [];
  const postedCron = [];
  const logger = { log() {}, error() {} };

  await handleMessage(
    "http://127.0.0.1:4173",
    { "agent-03": { command: process.execPath, args: ["-e", "console.log('cron done')"] } },
    {
      ...message,
      kind: "cron_task",
      cronType: "task",
      jobId: "daily-writing",
      title: "Daily writing"
    },
    {
      logger,
      postMessage: async (serverUrl, payload) => postedMessages.push({ serverUrl, payload }),
      postCronMessage: async (serverUrl, payload) => postedCron.push({ serverUrl, payload })
    }
  );

  assert.equal(postedMessages.length, 0);
  assert.equal(postedCron.length, 1);
  assert.equal(postedCron[0].payload.text, "cron done");
  assert.equal(postedCron[0].payload.cronType, "task");
  assert.equal(postedCron[0].payload.jobId, "daily-writing");
  assert.equal(postedCron[0].payload.title, "Daily writing");
  assert.equal(postedCron[0].payload.taskStatus, "completed");
});
