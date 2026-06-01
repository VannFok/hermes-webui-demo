import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const profileByAgentId = {
  "agent-01": "default",
  "agent-02": "hermies",
  "agent-03": "bf",
  "agent-04": "deercare"
};

export function resolveHermesProfile(message) {
  return process.env.HERMES_PROFILE || profileByAgentId[message.agentId] || "default";
}

export function resolveHermesSessionName(message, profile) {
  if (message.sessionName) return message.sessionName;
  if (process.env.HERMES_WEBUI_SESSION_NAME) return process.env.HERMES_WEBUI_SESSION_NAME;
  if (String(message.cronType || "").toLowerCase() === "task" && message.jobId) {
    return `hermes-webui-cron-${message.jobId}`;
  }
  const key = message.agentId || profile || "default";
  return `hermes-webui-${key}`;
}

export function buildHermesChatCommand(profile, input = "", sessionName = "") {
  const profileArg = profile ? ` -p ${shellQuote(profile)}` : "";
  const continueArg = sessionName ? ` --continue ${shellQuote(sessionName)}` : "";
  const promptArg = input ? ` -z ${shellQuote(input)}` : "";
  return [
    "set -e",
    "cd /home/raindy/.hermes/hermes-agent 2>/dev/null || cd /home/raindy/.hermes",
    `hermes${profileArg}${continueArg}${promptArg} chat`
  ].join("; ");
}

export function buildWslArgs(distro, profile, input = "", sessionName = "") {
  return ["-d", distro, "--", "bash", "-lc", buildHermesChatCommand(profile, input, sessionName)];
}

export function buildHermesInput(message) {
  const cronTask = String(message.cronType || "").toLowerCase() === "task";
  if (!cronTask && !message.replyToText) return message.text;

  const sections = [];
  if (cronTask) {
    sections.push("Cron task:");
    if (message.title) sections.push(`Title: ${message.title}`);
    if (message.jobId) sections.push(`Job: ${message.jobId}`);
    sections.push("");
  }

  if (message.replyToText) {
    sections.push("Reply context:");
    if (message.replyToTimestamp) sections.push(`Time: ${message.replyToTimestamp}`);
    sections.push(message.replyToText, "");
  }

  sections.push("User task:", message.text);
  return sections.filter((line) => line !== undefined && line !== null).join("\n");
}

export function stripHermesTerminalNoise(raw) {
  const text = String(raw || "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !isHermesBannerLine(line));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isHermesBannerLine(line) {
  const text = line.trim();
  if (!text) return false;

  if (/Hermes Agent v|upstream [0-9a-f]+|Available Tools/i.test(text)) return true;
  if (/(^|\s)(browser|browser-cdp|browser_dialog|clarify|code_execution|computer_use|cronjob|delegation):/i.test(text)) {
    return true;
  }
  if (/^[\s|+\-─━═╭╮╯╰┌┐└┘├┤┬┴┼.·•…⠁-⣿]+$/.test(text)) return true;
  return false;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runWslHermes({ distro, profile, input, sessionName, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const command = process.env.HERMES_WSL_EXE || "wsl.exe";
    const child = spawn(command, buildWslArgs(distro, profile, input, sessionName), {
      windowsHide: true,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ code: 1, stdout: "", stderr: error.message, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code: code ?? 0, stdout, stderr, timedOut });
    });
    child.stdin.end();
  });
}

function formatFailure(result, distro, profile) {
  if (result.timedOut) {
    return `WSL Hermes 超时未返回。distro=${distro}, profile=${profile}`;
  }

  const detail = summarizeHermesError(result.stderr || result.stdout);
  return [
    `WSL Hermes 调用失败。distro=${distro}, profile=${profile}`,
    detail || "没有拿到错误详情。请确认 WSL 里可以运行 hermes chat。"
  ].join("\n");
}

export function summarizeHermesError(raw) {
  const cleaned = stripHermesTerminalNoise(raw);
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const argparseLine = [...lines].reverse().find((line) => /hermes: error:/i.test(line));
  if (argparseLine) return argparseLine;
  return lines.slice(-8).join("\n");
}

async function main() {
  const message = {
    agentId: process.env.HERMES_WEBUI_AGENT_ID || "",
    agentName: process.env.HERMES_WEBUI_AGENT_NAME || "",
    text: process.env.HERMES_WEBUI_INPUT_TEXT || "",
    replyToText: process.env.HERMES_WEBUI_REPLY_TO_TEXT || "",
    replyToTimestamp: process.env.HERMES_WEBUI_REPLY_TO_TIMESTAMP || "",
    cronType: process.env.HERMES_WEBUI_CRON_TYPE || "",
    jobId: process.env.HERMES_WEBUI_CRON_JOB_ID || "",
    title: process.env.HERMES_WEBUI_CRON_TITLE || "",
    sessionName: process.env.HERMES_WEBUI_SESSION_NAME || ""
  };
  const distro = process.env.HERMES_WSL_DISTRO || "Ubuntu";
  const profile = resolveHermesProfile(message);
  const sessionName = resolveHermesSessionName(message, profile);
  const timeoutMs = Number(process.env.HERMES_WSL_TIMEOUT_MS || 180000);

  if (!message.text.trim()) {
    console.log("我收到了空输入，没有需要处理的内容。");
    return;
  }

  const result = await runWslHermes({
    distro,
    profile,
    input: buildHermesInput(message),
    sessionName,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000
  });
  const text = stripHermesTerminalNoise(result.code === 0 ? result.stdout : "");

  if (text) {
    console.log(text);
    return;
  }

  console.error(formatFailure(result, distro, profile));
  process.exitCode = result.code || 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
