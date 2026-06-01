import { existsSync } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function startInboxRelay({ inbox, server, interval = 700, signal } = {}) {
  if (!inbox || !server) throw new Error("inbox and server are required");

  const inboxPath = resolve(inbox);
  await mkdir(dirname(inboxPath), { recursive: true });
  if (!existsSync(inboxPath)) {
    const handle = await open(inboxPath, "a");
    await handle.close();
  }

  let offset = 0;
  let partial = "";
  let draining = false;

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      const info = await stat(inboxPath);
      if (info.size < offset) {
        offset = 0;
        partial = "";
      }
      if (info.size === offset) return;

      const length = info.size - offset;
      const buffer = Buffer.alloc(length);
      const handle = await open(inboxPath, "r");
      try {
        await handle.read(buffer, 0, length, offset);
      } finally {
        await handle.close();
      }
      offset = info.size;

      partial += buffer.toString("utf8");
      const lines = partial.split(/\r?\n/);
      partial = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        await relayInboxLine(server, trimmed);
      }
    } catch (error) {
      console.warn(`[inbox] ${error.message}`);
    } finally {
      draining = false;
    }
  };

  const timer = setInterval(drain, interval);
  signal?.addEventListener(
    "abort",
    () => {
      clearInterval(timer);
    },
    { once: true }
  );

  return { inboxPath, drain, stop: () => clearInterval(timer) };
}

async function relayInboxLine(server, line) {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    console.warn("[inbox] skipped invalid json line");
    return false;
  }

  const marker = String(payload.kind || payload.type || payload.channel || payload.source || "").toLowerCase();
  const endpoint = marker === "cron" || marker === "schedule" || marker === "scheduled" ? "/api/cron" : "/api/telegram";
  const response = await fetch(`${server}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    console.warn(`[inbox] relay failed: ${response.status}`);
    return false;
  }
  return true;
}
