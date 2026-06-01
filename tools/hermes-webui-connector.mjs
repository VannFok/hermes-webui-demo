import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaultServerUrl = "http://127.0.0.1:4173";

export function selectCommandForAgent(commands, message) {
  if (!commands || typeof commands !== "object") return null;
  return commands[message.agentId] || commands[message.agentName] || commands.default || null;
}

export function buildAgentEnvironment(message) {
  return {
    HERMES_WEBUI_MESSAGE_ID: String(message.id || ""),
    HERMES_WEBUI_AGENT_ID: String(message.agentId || ""),
    HERMES_WEBUI_AGENT_NAME: String(message.agentName || ""),
    HERMES_WEBUI_INPUT_TEXT: String(message.text || ""),
    HERMES_WEBUI_INPUT_MODE: String(message.mode || "agent"),
    HERMES_WEBUI_REPLY_TO_MESSAGE_ID: String(message.messageId || ""),
    HERMES_WEBUI_REPLY_TO_TEXT: String(message.replyToText || ""),
    HERMES_WEBUI_REPLY_TO_TIMESTAMP: String(message.replyToTimestamp || ""),
    HERMES_WEBUI_CRON_TYPE: String(message.cronType || ""),
    HERMES_WEBUI_CRON_JOB_ID: String(message.jobId || message.cronJobId || ""),
    HERMES_WEBUI_CRON_TITLE: String(message.title || ""),
    HERMES_WEBUI_SESSION_NAME: String(message.sessionName || "")
  };
}

export async function loadCommandConfig(path) {
  if (!path) return { commands: {} };
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { commands: {} };
    throw error;
  }
  const parsed = JSON.parse(content);
  return {
    commands: parsed.commands || parsed
  };
}

export async function drainOutbox(serverUrl) {
  const response = await fetch(new URL("/api/outbox?drain=1", serverUrl));
  if (!response.ok) throw new Error(`outbox request failed: ${response.status}`);
  const body = await response.json();
  return Array.isArray(body.messages) ? body.messages : [];
}

export async function postAgentMessage(serverUrl, payload) {
  const response = await fetch(new URL("/api/message", serverUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`message post failed: ${response.status}`);
}

export async function postCronMessage(serverUrl, payload) {
  const response = await fetch(new URL("/api/cron", serverUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`cron post failed: ${response.status}`);
}

function runCommand(commandSpec, message) {
  return new Promise((resolvePromise) => {
    if (!commandSpec?.command) {
      resolvePromise({ code: 0, stdout: "", stderr: "No command configured." });
      return;
    }

    const child = spawn(commandSpec.command, commandSpec.args || [], {
      cwd: commandSpec.cwd || process.cwd(),
      env: { ...process.env, ...buildAgentEnvironment(message), ...(commandSpec.env || {}) },
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolvePromise({ code: 1, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 0, stdout, stderr });
    });
    child.stdin.end(message.text || "");
  });
}

function missingCommandText(agentName) {
  return [
    `${agentName} 已收到你的输入，但还没有绑定真实 Hermes 命令。`,
    "请在 hermes-agent-commands.json 里配置这个 agent 的 command / args，然后重启 start-hermes-webui.cmd。"
  ].join("\n");
}

export async function handleMessage(serverUrl, commands, message, options = {}) {
  const logger = options.logger || console;
  const postMessage = options.postMessage || postAgentMessage;
  const postCron = options.postCronMessage || postCronMessage;
  const commandSpec = selectCommandForAgent(commands, message);
  const cronTask = isCronTaskMessage(message);
  if (!commandSpec) {
    logger.log(`[connector] no command configured for ${message.agentName || message.agentId}`);
    const payload = {
      agentId: message.agentId,
      agentName: message.agentName,
      text: missingCommandText(message.agentName || message.agentId),
      tone: cronTask ? "error" : "setup",
      cronType: cronTask ? "task" : undefined,
      jobId: message.jobId || null,
      title: message.title || "",
      taskStatus: cronTask ? "error" : undefined
    };
    if (cronTask) await postCron(serverUrl, payload);
    else await postMessage(serverUrl, payload);
    return;
  }

  const result = await runCommand(commandSpec, message);
  const text = (result.code === 0 ? result.stdout : result.stderr || result.stdout).trim();
  if (!text) return;

  const payload = {
    agentId: message.agentId,
    agentName: message.agentName,
    text,
    tone: result.code === 0 ? "live" : "error"
  };
  if (cronTask) {
    await postCron(serverUrl, {
      ...payload,
      tone: result.code === 0 ? "cron-task" : "error",
      kind: "cron",
      source: "cron",
      cronType: "task",
      jobId: message.jobId || null,
      title: message.title || "",
      taskStatus: result.code === 0 ? "completed" : "error"
    });
    return;
  }

  await postMessage(serverUrl, payload);
}

function isCronTaskMessage(message) {
  return (
    String(message?.cronType || "").toLowerCase() === "task" ||
    String(message?.kind || "").toLowerCase() === "cron_task" ||
    String(message?.mode || "").toLowerCase() === "cron_task"
  );
}

export function parseArgs(argv) {
  const options = {
    server: process.env.HERMES_WEBUI_URL || defaultServerUrl,
    commands: process.env.HERMES_WEBUI_COMMANDS || "hermes-agent-commands.json",
    interval: Number(process.env.HERMES_WEBUI_POLL_MS || 700)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--server") options.server = argv[++index];
    else if (arg === "--commands") options.commands = argv[++index];
    else if (arg === "--interval") options.interval = Number(argv[++index]);
  }

  return options;
}

function sleep(ms, signal) {
  return new Promise((resolvePromise) => {
    if (signal?.aborted) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(resolvePromise, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolvePromise();
      },
      { once: true }
    );
  });
}

export async function startConnector(options = {}) {
  const { commands } = await loadCommandConfig(options.commands);
  const interval = Number.isFinite(options.interval) && options.interval > 0 ? options.interval : 700;
  const server = options.server || defaultServerUrl;
  const logger = options.logger || console;

  logger.log(`[connector] polling ${server} every ${interval}ms`);
  for (;;) {
    if (options.signal?.aborted) return;
    try {
      const messages = await drainOutbox(server);
      for (const message of messages) {
        await handleMessage(server, commands, message, { logger });
      }
    } catch (error) {
      logger.error(`[connector] ${error.message}`);
    }
    if (options.once) return;
    await sleep(interval, options.signal);
  }
}

async function main() {
  await startConnector(parseArgs(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
