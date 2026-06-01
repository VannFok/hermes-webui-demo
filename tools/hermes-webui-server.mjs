import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createCronScheduler, defaultCronJobsPath } from "./hermes-webui-cron-scheduler.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRootDir = resolve(__dirname, "..");
const defaultAgentConfigPath = resolve(defaultRootDir, "hermes-agents.json");
const defaultHistoryPath = resolve(defaultRootDir, "hermes-webui-history.json");
const defaultEventLogPath = resolve(defaultRootDir, "hermes-webui-events.ndjson");
const historyLimitPerAgent = 3;
const allowedSources = new Set(["web", "telegram", "wsl", "cron", "system", "test"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

export async function loadAgentConfig(configPath = defaultAgentConfigPath) {
  const content = await readFile(configPath, "utf8");
  const parsed = JSON.parse(content);
  const agents = Array.isArray(parsed) ? parsed : parsed.agents;
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error("hermes agent config is empty");
  }
  return agents;
}

export function resolveAgent(agents, input = {}) {
  const key = String(input.agentId || input.agent || input.agentName || input.name || input.id || "")
    .trim()
    .toLowerCase();

  if (key) {
    const matched = agents.find((agent) => {
      const aliases = Array.isArray(agent.aliases) ? agent.aliases : [];
      return [agent.id, agent.name, ...aliases].some((value) => String(value).toLowerCase() === key);
    });
    if (matched) return matched;
  }

  return agents[0];
}

export function createHermesBridgeServer({
  agents,
  rootDir = defaultRootDir,
  historyPath = defaultHistoryPath,
  eventLogPath = defaultEventLogPath,
  cronJobsPath = defaultCronJobsPath
} = {}) {
  const agentList = agents || [];
  const staticRoot = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const rootPath = resolve(staticRoot);
  const resolvedHistoryPath = resolve(historyPath);
  const resolvedEventLogPath = resolve(eventLogPath);
  const resolvedCronJobsPath = resolve(cronJobsPath);
  const sseClients = new Set();
  const outbox = [];
  let cronScheduler = null;

  const broadcast = (eventName, payload) => {
    for (const response of sseClients) {
      writeSse(response, eventName, payload);
    }
  };

  const publishCronMessage = async (input) => {
    const message = normalizeAgentMessage(agentList, input, { kind: "cron", source: "cron", tone: "cron" });
    await rememberEventLogMessage(resolvedEventLogPath, "cron_message", message);
    broadcast("cron_message", message);
    return message;
  };

  const enqueueCronTask = async (message) => {
    outbox.push(message);
    if (outbox.length > 100) outbox.splice(0, outbox.length - 100);
    await rememberEventLogMessage(resolvedEventLogPath, "cron_task_scheduled", message);
    broadcast("cron_task_scheduled", message);
    return message;
  };

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

      if (request.method === "OPTIONS") {
        sendJson(response, 204, null);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/agents") {
        sendJson(response, 200, { agents: agentList });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/history") {
        const history = await loadMessageHistory(agentList, resolvedHistoryPath);
        sendJson(response, 200, history);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/history/full") {
        const history = await loadEventHistory(agentList, resolvedEventLogPath, {
          agentId: url.searchParams.get("agentId"),
          source: url.searchParams.get("source"),
          q: url.searchParams.get("q"),
          date: url.searchParams.get("date"),
          limit: url.searchParams.get("limit")
        });
        sendJson(response, 200, history);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/cron/history") {
        const history = await loadCronHistory(agentList, resolvedEventLogPath, {
          limit: url.searchParams.get("limit")
        });
        sendJson(response, 200, history);
        return;
      }

      if (request.method === "GET" && url.pathname === "/events") {
        openEventStream(request, response, sseClients, agentList);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/message") {
        const body = await readJsonBody(request);
        const message = normalizeAgentMessage(agentList, body);
        await rememberEventLogMessage(resolvedEventLogPath, "message", message);
        if (message.persist) await rememberHistoryMessage(agentList, resolvedHistoryPath, message);
        broadcast("message", message);
        sendJson(response, 202, { ok: true, message });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/telegram") {
        const body = await readJsonBody(request);
        const message = normalizeAgentMessage(agentList, body, { source: "telegram" });
        await rememberEventLogMessage(resolvedEventLogPath, "telegram_message", message);
        if (message.persist) await rememberHistoryMessage(agentList, resolvedHistoryPath, message);
        broadcast("telegram_message", message);
        sendJson(response, 202, { ok: true, message });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/cron") {
        const body = await readJsonBody(request);
        const message = await publishCronMessage(body);
        sendJson(response, 202, { ok: true, message });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/send") {
        const body = await readJsonBody(request);
        const message = normalizeUserMessage(agentList, body);
        outbox.push(message);
        if (outbox.length > 100) outbox.splice(0, outbox.length - 100);
        await rememberEventLogMessage(resolvedEventLogPath, "user_message", message);
        broadcast("user_message", message);
        sendJson(response, 202, { ok: true, message });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/outbox") {
        const messages = outbox.slice();
        if (url.searchParams.get("drain") === "1") outbox.length = 0;
        sendJson(response, 200, { messages });
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(response, rootPath, url.pathname, request.method === "HEAD");
        return;
      }

      sendJson(response, 405, { ok: false, error: "method not allowed" });
    } catch (error) {
      const status = Number(error.statusCode || error.status || 500);
      sendJson(response, status, { ok: false, error: error.message || "server error" });
    }
  });

  server.broadcast = broadcast;
  server.startCronScheduler = async () => {
    if (cronScheduler) return [];
    cronScheduler = createCronScheduler({
      agents: agentList,
      configPath: resolvedCronJobsPath,
      onReminder: publishCronMessage,
      onTask: enqueueCronTask
    });
    return cronScheduler.start();
  };
  server.stopCronScheduler = () => {
    cronScheduler?.stop();
    cronScheduler = null;
  };
  return server;
}

function normalizeAgentMessage(agents, input, options = {}) {
  const text = String(readTextInput(input)).trim();
  if (!text) {
    const error = new Error("message text is required");
    error.statusCode = 400;
    throw error;
  }

  const agent = resolveAgent(agents, input);
  const kind = input.kind || options.kind || "message";
  const source = normalizeMessageSource(input.source || options.source || "wsl");
  const cronType = normalizeCronType(input.cronType || options.cronType, kind, source);
  return {
    id: input.id || `hermes-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentId: agent.id,
    agentName: agent.name,
    text,
    timestamp: input.timestamp || new Date().toISOString(),
    tone: input.tone || options.tone || agent.status || "live",
    kind,
    source,
    cronType,
    jobId: input.jobId || input.cronJobId || null,
    title: input.title || "",
    taskStatus: input.taskStatus || null,
    persist: resolvePersistFlag({ ...input, kind, source })
  };
}

function readTextInput(input = {}) {
  if (typeof input.message === "string") return input.message;
  return (
    input.text ||
    input.messageText ||
    input.content ||
    input.message?.text ||
    input.update?.message?.text ||
    ""
  );
}

function normalizeUserMessage(agents, input) {
  const text = String(input.text || input.message || input.content || "").trim();
  if (!text) {
    const error = new Error("input text is required");
    error.statusCode = 400;
    throw error;
  }

  const agent = resolveAgent(agents, input);
  return {
    id: input.id || `webui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentId: agent.id,
    agentName: agent.name,
    text,
    messageId: input.messageId || null,
    replyToText: input.replyToText || "",
    replyToTimestamp: input.replyToTimestamp || null,
    mode: input.mode || "agent",
    timestamp: input.timestamp || new Date().toISOString(),
    kind: input.kind || "user_message",
    source: normalizeMessageSource(input.source || "web"),
    persist: false
  };
}

function normalizeMessageSource(value) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "bridge") return "wsl";
  return allowedSources.has(source) ? source : "wsl";
}

function normalizeCronType(value, kind = "", source = "") {
  const type = String(value || "").trim().toLowerCase();
  if (type === "task") return "task";
  if (type === "reminder") return "reminder";
  if (String(kind).toLowerCase() === "cron" || String(source).toLowerCase() === "cron") return "reminder";
  return null;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolvePersistFlag(message) {
  if (message.kind === "cron" || message.source === "cron" || message.source === "system") return false;
  if (typeof message.persist === "boolean") return message.persist;
  return message.source === "telegram" || message.source === "wsl";
}

export async function loadMessageHistory(agents, historyPath = defaultHistoryPath) {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(historyPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const history = createEmptyHistory(agents);
  const source = parsed?.history && typeof parsed.history === "object" ? parsed.history : {};
  for (const agent of agents) {
    const items = Array.isArray(source[agent.id]) ? source[agent.id] : [];
    history[agent.id] = items
      .map((message) => normalizeHistoryMessage(agent, message))
      .filter(Boolean)
      .slice(0, historyLimitPerAgent);
  }

  return {
    updatedAt: parsed?.updatedAt || null,
    history
  };
}

export async function loadEventHistory(agents, eventLogPath = defaultEventLogPath, filters = {}) {
  let raw = "";
  try {
    raw = await readFile(eventLogPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const agent = filters.agentId ? resolveAgent(agents, { agentId: filters.agentId }) : null;
  const source = String(filters.source || "").trim().toLowerCase();
  const query = String(filters.q || "").trim().toLowerCase();
  const date = String(filters.date || "").trim();
  const limit = clampNumber(Number(filters.limit) || 80, 1, 300);
  const messages = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry = null;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isUserFacingEvent(entry)) continue;
    if (agent && entry.agentId !== agent.id) continue;
    if (source && normalizeMessageSource(entry.source) !== source) continue;
    if (date && !String(entry.timestamp || entry.loggedAt || "").startsWith(date)) continue;
    if (query && !String(entry.text || "").toLowerCase().includes(query)) continue;
    messages.push(normalizeEventHistoryMessage(agents, entry));
  }

  return {
    messages: messages
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit)
  };
}

export async function loadCronHistory(agents, eventLogPath = defaultEventLogPath, filters = {}) {
  let raw = "";
  try {
    raw = await readFile(eventLogPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const limit = clampNumber(Number(filters.limit) || 30, 1, 100);
  const messages = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry = null;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (String(entry.kind || "") === "cron_task") continue;
    if (String(entry.kind || "") !== "cron" && normalizeMessageSource(entry.source || "") !== "cron") continue;
    messages.push(normalizeEventHistoryMessage(agents, entry));
  }

  return {
    messages: messages
      .filter(Boolean)
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit)
  };
}

function isUserFacingEvent(entry) {
  const source = normalizeMessageSource(entry?.source || "");
  const kind = String(entry?.kind || "");
  if (source === "test" || source === "system" || source === "cron") return false;
  if (kind === "system" || kind === "cron") return false;
  return source === "web" || source === "telegram" || source === "wsl";
}

function normalizeEventHistoryMessage(agents, entry) {
  const agent = resolveAgent(agents, { agentId: entry.agentId, agentName: entry.agentName });
  const text = String(entry.text || entry.message || "").trim();
  if (!text) return null;
  return {
    id: entry.id || `event-${entry.loggedAt || Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentId: agent.id,
    agentName: entry.agentName || agent.name,
    text,
    timestamp: entry.timestamp || entry.loggedAt || new Date().toISOString(),
    tone: entry.tone || agent.status || "live",
    kind: entry.kind || "message",
    source: normalizeMessageSource(entry.source || "wsl"),
    cronType: normalizeCronType(entry.cronType, entry.kind, entry.source),
    jobId: entry.jobId || entry.cronJobId || null,
    title: entry.title || "",
    taskStatus: entry.taskStatus || null,
    persist: entry.persist === true
  };
}

async function rememberHistoryMessage(agents, historyPath, message) {
  const agent = resolveAgent(agents, { agentId: message.agentId, agentName: message.agentName });
  const current = await loadMessageHistory(agents, historyPath);
  const normalized = normalizeHistoryMessage(agent, message);
  const messages = current.history[agent.id] || [];
  current.history[agent.id] = [
    normalized,
    ...messages.filter((entry) => entry.id !== normalized.id)
  ].slice(0, historyLimitPerAgent);
  current.updatedAt = new Date().toISOString();
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

async function rememberEventLogMessage(eventLogPath, eventName, message) {
  await mkdir(dirname(eventLogPath), { recursive: true });
  const event = {
    ...message,
    event: eventName,
    loggedAt: new Date().toISOString()
  };
  await appendFile(eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
}

function createEmptyHistory(agents) {
  return Object.fromEntries(agents.map((agent) => [agent.id, []]));
}

function normalizeHistoryMessage(agent, message) {
  const text = String(message?.text || message?.message || "").trim();
  if (!text) return null;
  return {
    id: message.id || `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    agentId: agent.id,
    agentName: message.agentName || agent.name,
    text,
    timestamp: message.timestamp || new Date().toISOString(),
    tone: message.tone || agent.status || "live",
    kind: message.kind || "message",
    source: normalizeMessageSource(message.source || "wsl"),
    cronType: normalizeCronType(message.cronType, message.kind, message.source),
    jobId: message.jobId || message.cronJobId || null,
    title: message.title || "",
    taskStatus: message.taskStatus || null,
    persist: message.persist !== false
  };
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      const error = new Error("request body is too large");
      error.statusCode = 413;
      throw error;
    }
  }

  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("invalid json body");
    error.statusCode = 400;
    throw error;
  }
}

function openEventStream(request, response, clients, agents) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*"
  });
  response.write(": connected\n\n");
  writeSse(response, "connected", { agents, timestamp: new Date().toISOString() });

  clients.add(response);
  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, 25000);

  request.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
  });
}

function writeSse(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  if (payload !== null) response.end(JSON.stringify(payload));
  else response.end();
}

async function serveStatic(response, rootPath, pathname, headOnly) {
  const safePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = resolve(rootPath, `.${safePath}`);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) {
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return;
  }

  let info;
  try {
    info = await stat(filePath);
  } catch {
    sendJson(response, 404, { ok: false, error: "not found" });
    return;
  }

  if (!info.isFile()) {
    sendJson(response, 404, { ok: false, error: "not found" });
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const cacheControl = extension === ".html"
    ? "no-cache, no-store, must-revalidate"
    : "public, max-age=86400";
  response.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "cache-control": cacheControl
  });
  if (headOnly) {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

async function main() {
  const agents = await loadAgentConfig();
  const port = Number(process.env.HERMES_WEBUI_PORT || 4173);
  const host = process.env.HERMES_WEBUI_HOST || "127.0.0.1";
  const server = createHermesBridgeServer({ agents });
  await server.startCronScheduler();

  server.listen(port, host, () => {
    console.log(`Hermes WebUI bridge listening at http://${host}:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
