import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const standaloneDir = path.resolve(scriptDir, "..");

function loadDotEnv(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${path.basename(filePath)}.`);
  }
}

loadDotEnv(path.join(standaloneDir, ".env"));

const {
  createBlogPost,
  normalizeSettings,
  upsertAdminCredentials,
  upsertSiteSettings,
} = await import("../supabase-store.mjs");

try {
  const posts = await readJson(path.join(standaloneDir, "data", "blog-posts.json"), []);
  if (!Array.isArray(posts)) throw new Error("Blog data must be an array.");

  const settings = await readJson(path.join(standaloneDir, "data", "settings.json"), {});
  await upsertSiteSettings(normalizeSettings(settings));

  for (const post of posts) await createBlogPost(post);

  const admin = await readJson(path.join(standaloneDir, "data", "admin.json"), null);
  if (admin && admin.hash && admin.salt) await upsertAdminCredentials(admin);

  console.log(`Supabase migration complete: ${posts.length} blog post(s), settings, and credentials processed.`);
} catch {
  console.error("Supabase migration failed. Confirm the SQL migration is applied and server credentials are configured.");
  process.exitCode = 1;
}
