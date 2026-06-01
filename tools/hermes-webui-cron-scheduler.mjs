import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRootDir = resolve(__dirname, "..");

export const defaultCronJobsPath = resolve(defaultRootDir, "hermes-webui-cron-jobs.json");

export async function loadCronJobConfig(configPath = defaultCronJobsPath) {
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = JSON.parse(content);
    return {
      jobs: Array.isArray(parsed) ? parsed : Array.isArray(parsed?.jobs) ? parsed.jobs : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { jobs: [] };
    throw error;
  }
}

export function normalizeCronJobs(agents, config = {}) {
  const jobs = Array.isArray(config?.jobs) ? config.jobs : [];
  const normalized = [];

  for (let index = 0; index < jobs.length; index += 1) {
    const raw = jobs[index] || {};
    if (raw.enabled !== true) continue;

    const type = normalizeCronType(raw.type);
    const schedule = normalizeCronSchedule(raw.schedule);
    if (!schedule) continue;

    const agent = resolveCronAgent(agents, raw);
    if (!agent) continue;

    const text = type === "task" ? String(raw.prompt || raw.text || "").trim() : String(raw.text || raw.prompt || "").trim();
    if (!text) continue;

    const title = String(raw.title || (type === "task" ? "Cron task" : "Cron reminder")).trim();
    const id = normalizeJobId(raw.id || `${type}-${agent.id}-${index + 1}`);

    normalized.push({
      id,
      type,
      enabled: true,
      agentId: agent.id,
      agentName: agent.name,
      schedule,
      timezone: String(raw.timezone || "Asia/Shanghai").trim() || "Asia/Shanghai",
      title,
      text,
      prompt: type === "task" ? text : ""
    });
  }

  return normalized;
}

export function computeNextCronRunAt(job, from = new Date()) {
  const schedule = job?.schedule || {};
  if (Number.isFinite(Number(schedule.intervalMinutes)) && Number(schedule.intervalMinutes) > 0) {
    return new Date(from.getTime() + Number(schedule.intervalMinutes) * 60_000);
  }

  if (typeof schedule.dailyAt === "string") {
    return computeNextDailyRunAt(schedule.dailyAt, job.timezone || "Asia/Shanghai", from);
  }

  throw new Error("unsupported cron schedule");
}

export function createCronScheduler({
  agents,
  configPath = defaultCronJobsPath,
  onReminder,
  onTask,
  logger = console,
  now = () => new Date()
} = {}) {
  let stopped = true;
  const timers = new Set();

  const scheduleJob = (job, from = now()) => {
    if (stopped) return;
    const runAt = computeNextCronRunAt(job, from);
    const delay = Math.max(0, runAt.getTime() - now().getTime());
    const timer = setTimeout(async () => {
      timers.delete(timer);
      if (stopped) return;

      try {
        if (job.type === "task") {
          await onTask?.(createCronTaskMessage(job, runAt));
        } else {
          await onReminder?.(createCronReminderMessage(job, runAt));
        }
      } catch (error) {
        logger.error?.(`[cron] ${job.id}: ${error.message}`);
      } finally {
        scheduleJob(job, new Date(runAt.getTime() + 1000));
      }
    }, Math.min(delay, 2_147_483_647));
    timers.add(timer);
  };

  return {
    async start() {
      stopped = false;
      const config = await loadCronJobConfig(configPath);
      const jobs = normalizeCronJobs(agents || [], config);
      for (const job of jobs) scheduleJob(job);
      return jobs;
    },
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    }
  };
}

export function createCronReminderMessage(job, scheduledAt = new Date()) {
  return {
    id: `cron-${job.id}-${scheduledAt.getTime()}`,
    agentId: job.agentId,
    agentName: job.agentName,
    text: job.text,
    timestamp: new Date().toISOString(),
    tone: "cron",
    kind: "cron",
    source: "cron",
    cronType: "reminder",
    jobId: job.id,
    title: job.title,
    taskStatus: null,
    persist: false
  };
}

export function createCronTaskMessage(job, scheduledAt = new Date()) {
  return {
    id: `cron-task-${job.id}-${scheduledAt.getTime()}`,
    agentId: job.agentId,
    agentName: job.agentName,
    text: job.prompt || job.text,
    timestamp: new Date().toISOString(),
    mode: "cron_task",
    kind: "cron_task",
    source: "cron",
    cronType: "task",
    jobId: job.id,
    title: job.title,
    taskStatus: "scheduled",
    sessionName: `hermes-webui-cron-${job.id}`,
    persist: false
  };
}

function normalizeCronType(type) {
  return String(type || "reminder").trim().toLowerCase() === "task" ? "task" : "reminder";
}

function normalizeCronSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return null;
  if (typeof schedule.dailyAt === "string" && /^\d{2}:\d{2}$/.test(schedule.dailyAt)) {
    const [hour, minute] = schedule.dailyAt.split(":").map(Number);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { dailyAt: schedule.dailyAt };
    }
  }
  const intervalMinutes = Number(schedule.intervalMinutes);
  if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
    return { intervalMinutes };
  }
  return null;
}

function resolveCronAgent(agents, input) {
  const key = String(input.agentId || input.agent || input.agentName || input.name || "").trim().toLowerCase();
  if (!agents?.length) return null;
  if (!key) return agents[0];
  return (
    agents.find((agent) => {
      const aliases = Array.isArray(agent.aliases) ? agent.aliases : [];
      return [agent.id, agent.name, ...aliases].some((value) => String(value).toLowerCase() === key);
    }) || null
  );
}

function normalizeJobId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `job-${Date.now()}`;
}

function computeNextDailyRunAt(dailyAt, timezone, from) {
  const [hour, minute] = dailyAt.split(":").map(Number);
  const parts = getZonedParts(from, timezone);
  let candidate = makeZonedDate(timezone, parts.year, parts.month, parts.day, hour, minute);
  if (candidate <= from) {
    const nextLocalDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0, 0));
    candidate = makeZonedDate(
      timezone,
      nextLocalDate.getUTCFullYear(),
      nextLocalDate.getUTCMonth() + 1,
      nextLocalDate.getUTCDate(),
      hour,
      minute
    );
  }
  return candidate;
}

function getZonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function makeZonedDate(timezone, year, month, day, hour, minute) {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = targetUtc;
  for (let index = 0; index < 3; index += 1) {
    const parts = getZonedParts(new Date(utc), timezone);
    const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    utc += targetUtc - zonedAsUtc;
  }
  return new Date(utc);
}
