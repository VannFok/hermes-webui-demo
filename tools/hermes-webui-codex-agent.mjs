import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const agentProfiles = {
  "agent-01": {
    name: "HermesFox",
    role: "coordination and signal scanning",
    style: "快速、敏锐、像团队里的前哨。"
  },
  "agent-02": {
    name: "Hermies",
    role: "planning and synthesis",
    style: "清晰、稳、擅长把复杂事压成下一步。"
  },
  "agent-03": {
    name: "BF",
    role: "building and execution",
    style: "直接、工程化、优先给能落地的动作。"
  },
  "agent-04": {
    name: "deercare",
    role: "watching, care, and risk control",
    style: "温和但警觉，先保护系统边界。"
  }
};

export function resolveAgentProfile(agentId, agentName) {
  return agentProfiles[agentId] || {
    name: agentName || "Hermes Agent",
    role: "general Hermes team work",
    style: "简洁、准确、可执行。"
  };
}

export function buildCodexPrompt(message) {
  const profile = resolveAgentProfile(message.agentId, message.agentName);
  const replyContext = message.replyToText
    ? [
        "Quoted message context:",
        message.replyToTimestamp ? `Time: ${message.replyToTimestamp}` : "",
        message.replyToText,
        ""
      ].filter(Boolean)
    : [];
  return [
    `你是 ${profile.name}，Hermes team WebUI 里的一个真实本地 agent。`,
    `你的职责：${profile.role}。`,
    `你的表达风格：${profile.style}`,
    "",
    "请用中文回复用户。除非用户明确要求长篇，否则保持简洁。不要声称自己已经接入 Telegram 或 WSL Hermes gateway。",
    "如果用户要求你执行本机操作，只说明你能做的下一步；不要编造已经完成的外部动作。",
    "",
    "用户输入：",
    ...replyContext,
    message.text
  ].join("\n");
}

export function buildCodexArgs(prompt, outputPath) {
  return [
    "exec",
    "--skip-git-repo-check",
    "--cd",
    projectRoot,
    "--sandbox",
    "workspace-write",
    "--output-last-message",
    outputPath,
    prompt
  ];
}

function runCodex(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
      shell: false
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
  });
}

async function main() {
  const message = {
    agentId: process.env.HERMES_WEBUI_AGENT_ID || "",
    agentName: process.env.HERMES_WEBUI_AGENT_NAME || "",
    text: process.env.HERMES_WEBUI_INPUT_TEXT || "",
    replyToText: process.env.HERMES_WEBUI_REPLY_TO_TEXT || "",
    replyToTimestamp: process.env.HERMES_WEBUI_REPLY_TO_TIMESTAMP || ""
  };

  if (!message.text.trim()) {
    console.log("我收到了空输入，没有需要处理的内容。");
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "hermes-webui-agent-"));
  const outputPath = join(tempDir, "last-message.txt");

  try {
    const prompt = buildCodexPrompt(message);
    const command = process.env.CODEX_CMD || "codex.cmd";
    const result = await runCodex(command, buildCodexArgs(prompt, outputPath));
    let finalText = "";

    try {
      finalText = (await readFile(outputPath, "utf8")).trim();
    } catch {
      finalText = "";
    }

    if (finalText) {
      console.log(finalText);
    } else if (result.stderr.trim()) {
      console.error(result.stderr.trim());
      process.exitCode = result.code || 1;
    } else {
      console.log(result.stdout.trim() || "Codex 没有返回可显示的内容。");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
