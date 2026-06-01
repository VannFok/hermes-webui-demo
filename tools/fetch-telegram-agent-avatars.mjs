import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_CODEX_BOT_TOKEN;
const mapPath = process.argv[2] || join(rootDir, "telegram-agents.json");

if (!token) {
  throw new Error("Set TELEGRAM_BOT_TOKEN or TELEGRAM_CODEX_BOT_TOKEN before running this script.");
}

const agents = JSON.parse(await readFile(mapPath, "utf8"));
const outputDir = join(rootDir, "avatars");
await mkdir(outputDir, { recursive: true });

async function telegram(method, params = {}) {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(`${method} failed: ${payload.description || response.statusText}`);
  }
  return payload.result;
}

async function getAvatarFileId(telegramId) {
  const chat = await telegram("getChat", { chat_id: telegramId });
  if (chat.photo?.big_file_id) return chat.photo.big_file_id;

  if (/^-?\d+$/.test(String(telegramId))) {
    const photos = await telegram("getUserProfilePhotos", { user_id: telegramId, limit: 1 });
    return photos.photos?.[0]?.at(-1)?.file_id || null;
  }

  return null;
}

async function downloadFile(filePath, outputPath) {
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

for (const agent of agents) {
  const { agentId, telegramId } = agent;
  if (!agentId || !telegramId) {
    throw new Error("Each entry must include agentId and telegramId.");
  }

  const fileId = await getAvatarFileId(telegramId);
  if (!fileId) {
    console.warn(`${agentId}: no Telegram avatar found`);
    continue;
  }

  const file = await telegram("getFile", { file_id: fileId });
  const outputPath = join(outputDir, `${agentId}.jpg`);
  await downloadFile(file.file_path, outputPath);
  console.log(`${agentId}: saved ${outputPath}`);
}
