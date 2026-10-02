#!/usr/bin/env node
/**
 * PinSaver Blogger agent - main pipeline.
 *
 *   pick topic -> generate post (Groq) -> publish (Blogger) -> log
 *
 * Modes:
 *   node src/index.js              generate and publish one post
 *   node src/index.js --dry-run    generate only, print a preview, publish nothing
 *   node src/index.js --verify     check Blogger credentials and list recent posts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePost, generateTopicVariation, countWords } from './generateContent.js';
import { BloggerClient, resolvePostUrl } from './publishToBlogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'topics.json');
const LOG_PATH = path.join(PROJECT_ROOT, 'logs', 'published.json');

const DEFAULT_LABELS = ['PinSaver', 'Pinterest Video Downloader', 'How-To'];
const MIN_WORDS = 800;
const MAX_WORDS = 1200;

main().catch((err) => {
  console.error(`\n[FAILED] ${err.message}\n`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = console.log.bind(console);

  const env = loadEnv();
  const config = readJson(CONFIG_PATH);
  const site = config.site;
  const history = readLog();

  log(`\n=== PinSaver Blogger agent ===`);
  log(`Blog    : ${site.blogUrl}`);
  log(`Site    : ${site.url}`);
  log(`Posted  : ${history.length} post(s) so far\n`);

  if (args.verify) {
    const client = buildClient(env, site, log);
    log('\nChecking credentials...');
    await client.verifyAccess();
    const posts = await client.listRecentPosts();
    log(`\nMost recent ${posts.length} post(s) on this blog:`);
    for (const p of posts) {
      log(`  - ${p.title}`);
      log(`    ${p.url}`);
      log(`    ${p.published}`);
    }
    log('\nAll good. The agent is wired to the right blog.\n');
    return;
  }

  if (args.dryRun) {
    log('DRY RUN - nothing will be published.\n');
  }

  const groqApiKey = requireEnv('GROQ_API_KEY');
  const client = args.dryRun ? null : buildClient(env, site, log);

  if (client) {
    await client.verifyAccess();
  }

  const topic = await pickTopic({ config, history, groqApiKey, site, args, log });

  log('\nGenerating post...');
  const post = await generatePost({
    apiKey: groqApiKey,
    topic: typeof topic === 'string' ? topic : topic.title,
    site,
    audience: config.audience,
    labels: DEFAULT_LABELS,
  });

  log(`\nTitle        : ${post.title}`);
  log(`Topic        : ${post.topic}`);
  log(`Words        : ${post.wordCount}`);
  log(`Meta         : ${post.metaDescription}`);
  log(`Backlinks    : ${countBacklinks(post.content, site.url)} to ${site.url}`);
  log(`Labels       : ${post.labels.join(', ')}`);

  warnIfOutOfRange(post.wordCount, log);

  if (args.dryRun) {
    log('\n--- POST PREVIEW (HTML) ---');
    log(post.content);
    log('--- END PREVIEW ---\n');
    log('Dry run complete. Nothing published.\n');
    return;
  }

  log('\nPublishing to Blogger...');
  const published = await client.publishPost({
    title: post.title,
    content: post.content,
    labels: post.labels,
  });

  const entry = {
    topic: post.topic,
    origin: typeof topic === 'string' ? 'config' : topic.origin,
    baseTopic: typeof topic === 'string' ? null : topic.baseTopic,
    title: post.title,
    url: resolvePostUrl(published.url, site.blogUrl),
    postId: published.postId,
    metaDescription: post.metaDescription,
    labels: post.labels,
    wordCount: post.wordCount,
    backlinks: countBacklinks(post.content, site.url),
    publishedAt: published.publishedAt,
  };

  history.push(entry);
  writeLog(history);

  log(`\n[PUBLISHED] ${entry.title}`);
  log(`URL: ${entry.url}`);
  log(`Logged to ${path.relative(PROJECT_ROOT, LOG_PATH)} (${history.length} total)\n`);
}

/**
 * Prefer an unused config topic. Once the list is exhausted, keep going by
 * asking Groq for fresh angles off the least recently used base topics.
 */
async function pickTopic({ config, history, groqApiKey, site, args, log }) {
  const usedTopics = history.map((entry) => entry.topic).filter(Boolean);

  if (args.topic) {
    log(`\nForced topic: "${args.topic}"`);
    return args.topic;
  }

  const unused = config.topics.filter((topic) => !usedTopics.includes(topic));

  if (unused.length) {
    const topic = unused[0];
    log(`\nSelected unused topic: "${topic}"`);
    log(`(${unused.length} of ${config.topics.length} config topics still unused)`);
    return topic;
  }

  log('\nAll config topics have been used - generating a fresh AI variation.');
  const baseTopic = pickLeastRecentBaseTopic({ config, history });
  return generateTopicVariation({
    apiKey: groqApiKey,
    baseTopic,
    usedTopics,
    site,
    logger: log,
  });
}

function pickLeastRecentBaseTopic({ config, history }) {
  const counts = new Map(config.topics.map((topic) => [topic, 0]));
  for (const entry of history) {
    const key = entry.baseTopic || entry.topic;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => a[1] - b[1]);
  const [topic] = sorted[0];
  return topic || config.topics[0];
}

function buildClient(env, site, log) {
  return new BloggerClient({
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    refreshToken: requireEnv('GOOGLE_REFRESH_TOKEN'),
    blogId: requireEnv('BLOGGER_BLOG_ID'),
    blogUrl: site.blogUrl,
    logger: log,
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it as a GitHub Actions secret, or in blogger-agent/.env for local runs.`,
    );
  }
  return value;
}

/** Lets a local blogger-agent/.env supply secrets without extra tooling. */
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    return Array.isArray(data) ? data : data.posts || [];
  } catch {
    console.warn('[warn] logs/published.json was unreadable, starting a fresh list.');
    return [];
  }
}

function writeLog(history) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

function countBacklinks(content, siteUrl) {
  return (content.match(new RegExp(escapeRegExp(siteUrl), 'g')) || []).length;
}

function warnIfOutOfRange(wordCount, log) {
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    log(
      `\n[warn] Post is ${wordCount} words, outside the ${MIN_WORDS}-${MAX_WORDS} target. ` +
        'Still publishing - review quality in the Blogger draft.',
    );
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) continue;
    // --dry-run becomes dryRun so callers read args.dryRun
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    parsed[key] = match[2] === undefined ? true : match[2];
  }
  return parsed;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
