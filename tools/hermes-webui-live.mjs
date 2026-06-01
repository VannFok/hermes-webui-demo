import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startConnector } from "./hermes-webui-connector.mjs";
import { startInboxRelay } from "./hermes-webui-inbox.mjs";
import { createHermesBridgeServer, loadAgentConfig } from "./hermes-webui-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    host: process.env.HERMES_WEBUI_HOST || "127.0.0.1",
    port: Number(process.env.HERMES_WEBUI_PORT || 4173),
    commands: process.env.HERMES_WEBUI_COMMANDS || resolve(rootDir, "hermes-agent-commands.json"),
    interval: Number(process.env.HERMES_WEBUI_POLL_MS || 700),
    inbox: process.env.HERMES_WEBUI_INBOX || resolve(rootDir, "hermes-webui-inbox.ndjson"),
    cronJobs: process.env.HERMES_WEBUI_CRON_JOBS || resolve(rootDir, "hermes-webui-cron-jobs.json")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") options.host = argv[++index];
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--commands") options.commands = argv[++index];
    else if (arg === "--interval") options.interval = Number(argv[++index]);
    else if (arg === "--inbox") options.inbox = argv[++index];
    else if (arg === "--cron-jobs") options.cronJobs = argv[++index];
  }

  return options;
}

async function listen(server, port, host) {
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const agents = await loadAgentConfig();
  const server = createHermesBridgeServer({ agents, rootDir, cronJobsPath: options.cronJobs });
  const controller = new AbortController();
  const serverUrl = `http://${options.host}:${options.port}`;

  await listen(server, options.port, options.host);
  const cronJobs = await server.startCronScheduler();
  console.log(`[live] Hermes WebUI ready at ${serverUrl}`);
  console.log(`[live] connector command config: ${options.commands}`);
  console.log(`[live] cron jobs: ${cronJobs.length} enabled from ${options.cronJobs}`);
  const inboxRelay = await startInboxRelay({
    inbox: options.inbox,
    server: serverUrl,
    interval: options.interval,
    signal: controller.signal
  });
  console.log(`[live] inbox relay: ${inboxRelay.inboxPath}`);

  const stop = () => {
    controller.abort();
    server.stopCronScheduler();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await startConnector({
    server: serverUrl,
    commands: options.commands,
    interval: options.interval,
    signal: controller.signal
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
