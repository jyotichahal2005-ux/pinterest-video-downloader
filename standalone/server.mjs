import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SETTINGS,
  createBlogPost,
  deleteBlogPost,
  getAdminCredentials,
  getBlogPosts,
  getSiteSettings,
  updateBlogPost,
  upsertAdminCredentials,
  upsertSiteSettings,
} from "./supabase-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 8080;

// ------------------------------ .env loader ------------------------------

const ENV_FILE = path.join(__dirname, ".env");

function loadDotEnv() {
  let text;
  try {
    text = fs.readFileSync(ENV_FILE, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";

// --------------------------- Site settings (config) ---------------------------

async function loadSettings() {
  return getSiteSettings();
}

async function saveSettings(settings) {
  return upsertSiteSettings(settings);
}

// --------------------------- Admin credentials (hashed) ---------------------------

async function loadAdminRecord() {
  return getAdminCredentials();
}

async function saveAdminRecord(record) {
  return upsertAdminCredentials(record);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

async function adminPasswordMatches(password) {
  const rec = await loadAdminRecord();
  if (rec && rec.hash && rec.salt) {
    const a = hashPassword(password, rec.salt);
    const b = String(rec.hash);
    return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  }
  return String(password || "") === ADMIN_PASSWORD;
}

async function adminConfigured() {
  if (ADMIN_PASSWORD) return true;
  return adminPasswordMatchesEnabled();
}

async function adminPasswordMatchesEnabled() {
  const rec = await loadAdminRecord();
  return !!(rec && rec.hash && rec.salt);
}

// ------------------------------- AI Assistant --------------------------------

const AI_ACTIONS = new Set(["outline", "content", "tags", "faqs", "excerpt", "seo", "improve"]);
const AI_KEY = (process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "").trim();

function aiProvider() {
  const configured = (process.env.AI_PROVIDER || "").toLowerCase();
  if (configured) return configured;
  return AI_KEY.startsWith("AIza") ? "gemini" : "gemini";
}

function aiModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  const provider = aiProvider();
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "groq") return "llama-3.3-70b-versatile";
  if (provider === "openrouter") return "openai/gpt-4o-mini";
  return "gemini-3.5-flash-lite";
}

function aiBaseUrl() {
  if (process.env.AI_BASE_URL) return process.env.AI_BASE_URL.replace(/\/$/, "");
  const provider = aiProvider();
  if (provider === "groq") return "https://api.groq.com/openai/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  return "https://api.openai.com/v1";
}

async function aiStatus() {
  return {
    configured: Boolean(AI_KEY),
    provider: aiProvider(),
    model: aiModel(),
    adminAuth: await adminConfigured(),
  };
}

const SITE_CONTEXT = [
  "You write SEO blog articles for PinSaver (https://pinterest-video-downloader-69a6.onrender.com), a free online Pinterest video downloader tool.",
  "The tool lets visitors paste a public Pinterest pin URL and get direct MP4 download links.",
  "Articles are practical, helpful guides â€” no fluff, no fake promises, no exaggeration.",
  "Always write in clear, simple, natural English.",
].join("\n");

function buildAiRequest(action, input) {
  const title = String(input.title || "").trim();
  const category = String(input.category || "tips").trim();
  const keywords = String(input.keywords || "").trim();
  const tone = String(input.tone || "friendly").trim();
  const targetWords = Math.max(500, Math.min(1400, Number(input.wordCount) || 900));
  const notes = String(input.notes || "").trim();

  switch (action) {
    case "outline": {
      const user = [
        title ? `Blog post title: ${title}` : "Blog post title: (untitled)", 
        category ? `Category: ${category}` : "",
        keywords ? `Target keywords: ${keywords}` : "",
        `Tone: ${tone}`,
        notes ? `Creator notes / extra context:\n${notes}` : "",
        "",
        "Create a detailed article outline as Markdown. Use one H2 per major section and H3 sub-sections where useful.",
        "After each heading, add a short bullet line describing what that section will cover.",
        "Aim for 6-9 sections an SEO article on this topic needs (problem intro, solution, step-by-step, tips, troubleshooting, FAQ).",
      ].filter(Boolean).join("\n");
      return { system: SITE_CONTEXT, user };
    }

    case "content": {
      const user = [
        title ? `Blog post title: ${title}` : "Blog post title: (choose a sensible title from the notes below)",
        `Target length: around ${targetWords} words`,
        `Category: ${category}`,
        keywords ? `Target keywords: ${keywords}` : "",
        `Tone: ${tone}`,
        notes ? `Creator outline / notes to follow:\n${notes}` : "",
        "",
        "Write the complete article as Markdown. Start with an H1 title.",
        "Requirements:",
        "- A strong intro that names the reader's problem.",
        "- 4-7 H2 sections with short paragraphs, bullet lists, and concrete steps.",
        "- Mention PinSaver naturally 2-3 times and tell readers where to paste their Pinterest link. Do not invent URLs or features; only refer to the tool by name and its ability to extract MP4 links from public pins.",
        "- End with a short 'Frequently asked questions' H2 section with 3-4 Q&A items.",
        "- Do NOT include a plain 'Conclusion' section.",
        "- Use markdown links like [PinSaver](https://pinterest-video-downloader-69a6.onrender.com) at most 2 times.",
      ].filter(Boolean).join("\n");
      return { system: SITE_CONTEXT, user };
    }

    case "tags": {
      const user = [
        title ? `Blog post title: ${title}` : "Blog post topic: (untitled)",
        category ? `Category: ${category}` : "",
        keywords ? `Target keywords: ${keywords}` : "",
        "",
        "Suggest 8-10 relevant, lowercase tags for this blog post.",
        'Return ONLY a JSON array of strings, for example: ["pinterest", "video downloader", "mp4"]',
      ].filter(Boolean).join("\n");
      return { system: SITE_CONTEXT, user };
    }

    case "faqs": {
      const user = [
        title ? `Blog post title: ${title}` : "",
        notes ? `Article content the FAQ must match:\n${notes.slice(0, 5000)}` : `Write 4-5 short FAQ Q&As a reader of this Pinterest video downloader topic would search for.`,
        "",
        'Return ONLY a JSON array of objects with exactly two keys "question" and "answer": [{"question": "...", "answer": "..."}]',
        "Answers must be 1-3 sentences, practical, and consistent with the article above.",
      ].filter(Boolean).join("\n");
      return { system: SITE_CONTEXT, user };
    }

    case "excerpt": {
      return {
        system: SITE_CONTEXT,
        user: [
          title ? `Blog post title: ${title}` : "Blog post title: (untitled)",
          notes ? `Article content:\n${notes.slice(0, 6000)}` : "",
          "",
          "Write a single compelling excerpt (1-2 sentences, under 160 characters) for the blog listing page.",
          "Return ONLY the excerpt text with no quotation marks and no extra words.",
        ].filter(Boolean).join("\n"),
      };
    }

    case "seo": {
      return {
        system: SITE_CONTEXT,
        user: [
          title ? `Blog post title: ${title}` : "Blog post title: (untitled)",
          notes ? `Article content:\n${notes.slice(0, 6000)}` : "",
          keywords ? `Target keywords: ${keywords}` : "",
          "",
          "Write SEO meta tags for this post.",
          'Return ONLY JSON: {"metaTitle": "... (max 60 chars)", "metaDescription": "... (max 160 chars)"}',
        ].filter(Boolean).join("\n"),
      };
    }

    case "improve": {
      return {
        system: SITE_CONTEXT,
        user: [
          "Rewrite and improve the article below. Keep the structure and all facts, but:",
          "- Fix grammar and spelling, tighten sentences.",
          "- Keep the Markdown formatting and the H1 title.",
          notes ? `Article to improve:\n${notes.slice(0, 8000)}` : "No article provided.",
        ].filter(Boolean).join("\n"),
      };
    }

    default:
      return { system: SITE_CONTEXT, user: "" };
  }
}

async function callGemini(prompt, system) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(aiModel())}:generateContent?key=${encodeURIComponent(AI_KEY)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Gemini API returned HTTP ${res.status}${detail ? ` - ${detail.slice(0, 300)}` : ""}`
      );
    }
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text.trim()) throw new Error("Gemini returned an empty response.");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAi(prompt, system) {
  const url = `${aiBaseUrl()}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: aiModel(),
        messages: [
          system ? { role: "system", content: system } : null,
          { role: "user", content: prompt },
        ].filter(Boolean),
        temperature: 0.6,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `AI API returned HTTP ${res.status}${detail ? ` - ${detail.slice(0, 300)}` : ""}`
      );
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text.trim()) throw new Error("AI returned an empty response.");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function runAi(prompt, system) {
  if (!AI_KEY) {
    throw Object.assign(
      new Error(
        "AI is not configured. Add AI_API_KEY in the standalone/.env file (free Gemini key from aistudio.google.com)."
      ),
      { status: 503 }
    );
  }
  return aiProvider() === "gemini" ? callGemini(prompt, system) : callOpenAi(prompt, system);
}

function extractJson(text) {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text || "");
  const start = candidate.indexOf("{");
  const arrStart = candidate.indexOf("[");
  let begin = 0;
  if (start === -1 && arrStart === -1) return null;
  begin = arrStart === -1 ? start : start === -1 ? arrStart : Math.min(start, arrStart);
  const slice = candidate.slice(begin).trim();
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function adminAuthed(req) {
  return (req.headers.cookie || "").includes("pinsaver_admin=1");
}

// ---------- Inject site settings into served HTML ----------

async function applySiteSettings(html, isContactPage) {
  const s = await loadSettings();
  let out = String(html);

  if (s.siteTitle && s.siteTitle.trim() && s.siteTitle !== "PinSaver") {
    out = out.replace(/\| PinSaver(?=\s*<\/title>)/, "| " + escapeHtml(s.siteTitle.trim()));
  }

  if (s.defaultMetaDescription && !/<meta\s+name="description"/i.test(out)) {
    out = out.replace(
      /<\/head>/,
      `  <meta name="description" content="${escapeHtml(s.defaultMetaDescription.trim())}" />\n  </head>`
    );
  }

  if (s.defaultOgImage && /https:\/\/pinsaver\.app\/img\/og-image\.png\?v=2/.test(out)) {
    out = out.replace(/https:\/\/pinsaver\.app\/img\/og-image\.png\?v=2/g, escapeHtml(s.defaultOgImage.trim()));
  }

  if (s.gaId) {
    out = out.replace(
      /<\/head>/,
      `  <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(s.gaId.trim())}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escapeHtml(s.gaId.trim())}');
  </script>
  </head>`
    );
  }

  if (s.gscVerifyTag) {
    const cleaned = String(s.gscVerifyTag).replace(/<\/?script[\s\S]*?>/gi, "").trim();
    if (cleaned && /<meta/i.test(cleaned)) {
      out = out.replace(/<\/head>/, `  ${cleaned}\n  </head>`);
    }
  }

  if (isContactPage) {
    if (s.supportEmail) {
      out = out.split("hello@pinsaver.app").join(escapeHtml(s.supportEmail.trim()));
    }
    if (s.supportPhone) {
      out = out.replace(
        /<!--CONTACT-INFO-->/,
        `<p style="margin-top:1rem;" class="contact-phone"><span aria-hidden="true">&#9742;</span> Call or WhatsApp: <a href="tel:${escapeHtml(s.supportPhone.trim())}" class="link-inline">${escapeHtml(s.supportPhone.trim())}</a></p>`
      );
    } else {
      out = out.replace(/<!--CONTACT-INFO-->/, "");
    }
  }

  return out;
}

// ------------------------- Pinterest download logic -------------------------

const PINTEREST_HOSTS = new Set(["pinterest.com", "www.pinterest.com"]);
const SHORT_HOST = "pin.it";
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(value) {
  return decodeHtml(value)
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function getMetaContent(html, property) {
  const tagPattern = /<meta\b[^>]*>/gi;
  const attributePattern = /([:\w-]+)\s*=\s*(['"])(.*?)\2/gi;

  for (const tag of html.matchAll(tagPattern)) {
    const attributes = new Map();
    for (const attribute of tag[0].matchAll(attributePattern)) {
      attributes.set(
        attribute[1].toLowerCase(),
        decodeHtml(attribute[3])
      );
    }
    if (
      attributes.get("property")?.toLowerCase() === property.toLowerCase() ||
      attributes.get("name")?.toLowerCase() === property.toLowerCase()
    ) {
      const content = attributes.get("content");
      if (content) return normalizeUrl(content);
    }
  }
  return null;
}

function videoLabel(url, index) {
  const qualityMatch = url.match(
    /(?:^|[/_-])(480|720|1080)(?:p)?(?:[/_.?-]|$)/i
  );
  if (qualityMatch) return { label: `${qualityMatch[1]}p`, quality: Number(qualityMatch[1]) };

  const dimensionMatch = url.match(
    /(?:^|[/_-])(\d{3,4})x\d{3,4}(?:[/_.?-]|$)/i
  );
  if (dimensionMatch) return { label: `${dimensionMatch[1]}p`, quality: Number(dimensionMatch[1]) };

  return { label: `Video ${index + 1}`, quality: 0 };
}

function extractVideoCandidates(html) {
  const normalizedHtml = normalizeUrl(html);
  const urlPattern =
    /https?:\/\/v1\.pinimg\.com\/videos\/[^"'<>\\\s]+?\.mp4(?:\?[^"'<>\\\s]*)?/gi;
  const candidates = new Map();

  for (const match of normalizedHtml.matchAll(urlPattern)) {
    const url = normalizeUrl(match[0]);
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (!candidates.has(url)) {
      const { label, quality } = videoLabel(url, candidates.size);
      candidates.set(url, { url, label, quality });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.quality - a.quality)
    .map(({ url, label }) => ({ url, label }));
}

function isPinterestUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (PINTEREST_HOSTS.has(host) || host === SHORT_HOST)
    );
  } catch {
    return false;
  }
}

function isPinPage(value) {
  try {
    const parsed = new URL(value);
    return (
      PINTEREST_HOSTS.has(parsed.hostname.toLowerCase()) &&
      /\/pin\/[^/]+/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

async function fetchPinterestPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Pinterest returned HTTP ${response.status}`);
    }
    return { html: await response.text(), finalUrl: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadPinterestVideo(rawUrl) {
  if (!rawUrl || !isPinterestUrl(rawUrl)) {
    throw Object.assign(new Error("Enter a valid Pinterest pin link."), { status: 400 });
  }

  const { html, finalUrl } = await fetchPinterestPage(rawUrl);
  if (!isPinPage(finalUrl)) {
    throw Object.assign(new Error("That link does not point to a Pinterest pin."), {
      status: 400,
    });
  }

  const videos = extractVideoCandidates(html);
  const fallbackVideo = getMetaContent(html, "og:video:secure_url");
  if (videos.length === 0 && fallbackVideo?.toLowerCase().includes(".mp4")) {
    const { label } = videoLabel(fallbackVideo, 0);
    videos.push({ url: fallbackVideo, label });
  }

  if (videos.length === 0) {
    throw Object.assign(new Error("No video was found on that Pinterest pin."), {
      status: 400,
    });
  }

  const title =
    getMetaContent(html, "og:title") ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
    "Pinterest video";
  const thumbnail = getMetaContent(html, "og:image");

  return {
    title: (decodeHtml(title).trim() || "Pinterest video").replace(/\s+/g, " "),
    thumbnail,
    videos,
  };
}

// -------------------------------- Blog CMS ---------------------------------

async function loadBlogPosts() {
  return getBlogPosts();
}

function getPostById(posts, id) {
  return posts.find((p) => p.id === id);
}

function getPostBySlug(posts, slug) {
  return posts.find((p) => p.slug === slug);
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readTimeFor(content) {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(3, Math.round(words / 200));
  return `${minutes} min read`;
}

function uniqueSlug(posts, slug, ignoreId) {
  let candidate = slug || "post";
  let base = candidate;
  let n = 2;
  while (posts.some((p) => p.slug === candidate && p.id !== ignoreId)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let listType = null;
  let inCode = false;
  let codeBuf = [];
  let inQuote = false;

  const inline = (raw) => {
    let text = escapeHtml(raw);
    text = text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  };

  const flushBlock = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
    if (inQuote) {
      html += "</blockquote>";
      inQuote = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html += `<pre><code>${codeBuf.map((l) => escapeHtml(l)).join("\n")}</code></pre>`;
        codeBuf = [];
        inCode = false;
      } else {
        flushBlock();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushBlock();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBlock();
      const level = heading[1].length;
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }

    const hr = trimmed.match(/^([-*_])[ \t]*\1[ \t]*\1+$/);
    if (hr) {
      flushBlock();
      html += "<hr>";
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unordered) {
      if (listType !== "ul") {
        flushBlock();
        listType = "ul";
        html += "<ul>";
      }
      html += `<li>${inline(unordered[1])}</li>`;
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        flushBlock();
        listType = "ol";
        html += "<ol>";
      }
      html += `<li>${inline(ordered[1])}</li>`;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      if (!inQuote) {
        flushBlock();
        inQuote = true;
        html += "<blockquote>";
      }
      html += `<p>${inline(quote[1])}</p>`;
      continue;
    }

    flushBlock();
    html += `<p>${inline(trimmed)}</p>`;
  }
  flushBlock();
  if (inCode) {
    html += `<pre><code>${codeBuf.map((l) => escapeHtml(l)).join("\n")}</code></pre>`;
  }
  return html;
}

function pickRelated(posts, slug, limit = 3) {
  const current = posts.find((p) => p.slug === slug);
  const others = posts.filter((p) => p.slug !== slug && p.status === "published");
  const same = others.filter((p) => p.category === (current?.category || ""));
  const seen = new Set();
  const out = [];
  for (const p of [...same, ...others]) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function relatedLinksHtml(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return "";
  const links = posts
    .map((p) => `          <li><a href="/blog/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></li>`)
    .join("\n");
  return `      <div class="related-links" style="margin-top:2.2rem;border-top:1px solid rgba(146,22,22,.12);padding-top:1.3rem;">
        <strong style="text-transform:uppercase;letter-spacing:.14em;font-size:.68rem;color:#9a3a3a;">Keep reading</strong>
        <ul style="margin:.8rem 0 0 1.1rem;font-size:.95rem;line-height:1.9;">
${links}
        </ul>
      </div>

`;
}

function renderBlogPostPage(post, relatedPosts) {
  const pageTitle = post.metaTitle || post.title || "Pinterest Video Guide";
  const pageDescription = post.metaDescription || post.excerpt || "";
  const contentHtml = renderMarkdown(post.content);
  const faqs = Array.isArray(post.faqs) ? post.faqs.filter((f) => f && f.question && f.answer) : [];

  const faqHtml = faqs.length
    ? `<div class="post-faqs">
        <h2>Frequently Asked Questions</h2>
        <div class="faq-list">
          ${faqs
            .map(
              (f, i) => `
          <div class="faq-item${i === 0 ? " open" : ""}">
            <button class="faq-q">${escapeHtml(f.question)}<span class="plus">+</span></button>
            <div class="faq-a">${escapeHtml(f.answer).replace(/\n/g, "<br>")}</div>
          </div>`
            )
            .join("")}
        </div>
      </div>`
    : "";

  const faqSchema = faqs.length
    ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [${faqs
      .map(
        (f) => `{"@type":"Question","name":${JSON.stringify(f.question)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(f.answer)}}}`
      )
      .join(",")}]
  }
  </script>`
    : "";

  const cover = post.coverImage
    ? `<figure class="post-media">
        <img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" loading="lazy" style="width:100%;">
      </figure>`
    : "";

  const tagsHtml = Array.isArray(post.tags) && post.tags.length
    ? `<div class="post-tags">${post.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  const date = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const dateIso = post.createdAt ? new Date(post.createdAt).toISOString().slice(0, 10) : "";

  const articleSchema = `{
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(post.metaTitle || post.title)},
    "description": ${JSON.stringify(post.metaDescription || post.excerpt || "")},
    "image": ${JSON.stringify(post.coverImage || "")},
    "datePublished": ${JSON.stringify(dateIso)},
    "dateModified": ${JSON.stringify(post.updatedAt ? new Date(post.updatedAt).toISOString().slice(0, 10) : dateIso)},
    "author": { "@type": "Person", "name": ${JSON.stringify(post.author || "PinSaver Team")} },
    "publisher": { "@type": "Organization", "name": "PinSaver", "logo": { "@type": "ImageObject", "url": "https://pinterest-video-downloader-69a6.onrender.com/favicon.svg" } },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "https://pinterest-video-downloader-69a6.onrender.com/blog/${encodeURIComponent(post.slug)}" },
    "articleSection": ${JSON.stringify(post.category || "Guide")},
    "inLanguage": "en"
  }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#ffffff" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDescription)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://pinterest-video-downloader-69a6.onrender.com/blog/${encodeURIComponent(post.slug)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(pageDescription)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://pinterest-video-downloader-69a6.onrender.com/blog/${encodeURIComponent(post.slug)}" />
  <meta property="og:image" content="https://pinterest-video-downloader-69a6.onrender.com/img/og-image.png?v=2" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://pinterest-video-downloader-69a6.onrender.com/img/og-image.png?v=2" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />
  <link rel="stylesheet" href="/css/style.css?v=13" />${faqSchema}
  <script type="application/ld+json">
  ${articleSchema}
  </script>
</head>
<body>
  <div data-header></div>

  <main>
    <article class="prose" style="max-width:46rem;">
      <a class="back-link" href="/blog">â† Back to field notes</a>
      <span class="section-kicker" style="margin-top:2rem;display:inline-flex;">${escapeHtml(post.category || "Guide")}</span>
      <h1 style="font-size:clamp(2.2rem,5.5vw,3.6rem);letter-spacing:-0.05em;line-height:1.05;margin-top:.8rem;">${escapeHtml(post.title)}</h1>
      <div class="card-foot" style="margin-top:1rem;">
        <span class="avatar">PS</span>
        <span class="byline">${escapeHtml(post.author || "PinSaver Team")}</span>
        ${date ? `<time class="date" datetime="${dateIso}">${escapeHtml(date)}</time>` : ""}
      </div>
      ${cover}
      <div class="post-body">
        ${contentHtml}
      </div>
      ${tagsHtml}
      ${faqHtml}
      ${relatedLinksHtml(relatedPosts)}
      <aside class="cta-box" style="margin-top:2rem;">
        <h2>Ready to try it yourself?</h2>
        <p>Paste a public Pinterest link and see which video files are available.</p>
        <a class="btn btn-primary" href="/" style="margin-top:1rem;">Open the downloader</a>
      </aside>
    </article>
  </main>

  <div data-footer></div>
  <script src="/js/layout.js?v=4"></script>
</body>
</html>`;
}

function renderBlogListingPage(publicPosts) {
  const cardFor = (post) => {
    const categoryLabel = {
      device: "Device Guides",
      tips: "Tips & How-To",
      troubleshoot: "Troubleshooting & Legal",
    }[post.category] || "Tips & How-To";
    const date = post.createdAt
      ? new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";
const dateIso = post.createdAt ? new Date(post.createdAt).toISOString().slice(0, 10) : "";
    const cover = post.coverImage
      ? `<img class="blog-img" src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" loading="lazy">`
      : "";
    return `<a class="blog-card" href="/blog/${encodeURIComponent(post.slug)}" data-category="${escapeHtml(post.category || "tips")}">
      <div class="blog-card-image">${cover}</div>
      <div class="card-content">
        <div class="meta"><span>${categoryLabel}</span><span>${escapeHtml(post.readTime || "5 min read")}</span></div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.excerpt || post.metaDescription || "")}</p>
        <div class="card-foot">
          <span class="avatar">PS</span>
          <span class="byline">${escapeHtml(post.author || "PinSaver Team")}</span>
          ${date ? `<time class="date" datetime="${dateIso}">${escapeHtml(date)}</time>` : ""}
        </div>
        <span class="cta">Read the guide <span class="arrow">â†’</span></span>
      </div>
    </a>`;
  };

  return publicPosts.map(cardFor).join("\n");
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

// ----------------------------- Static serving ------------------------------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function resolvePublicPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  let filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (
    !filePath.startsWith(PUBLIC_DIR + path.sep) &&
    filePath !== PUBLIC_DIR
  ) {
    return null;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    stat = null;
  }

  if (stat && stat.isDirectory()) {
    const dirIndex = path.join(filePath, "index.html");
    try {
      if (fs.statSync(dirIndex).isFile()) return dirIndex;
    } catch {
      /* fall through to .html check */
    }
    filePath = filePath + ".html";
    try {
      if (!fs.statSync(filePath).isFile()) return null;
    } catch {
      return null;
    }
  } else if (!stat && !path.extname(decoded)) {
    filePath = filePath + ".html";
    try {
      if (!fs.statSync(filePath).isFile()) return null;
    } catch {
      return null;
    }
  } else if (!stat && path.extname(decoded)) {
    try {
      if (!fs.statSync(filePath).isFile()) return null;
    } catch {
      return null;
    }
  }

  return filePath;
}

// -------------------------------- Server -----------------------------------

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

async function sendFile(res, filePath, req) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (ext === ".html") {
    const isContact = path.basename(filePath).toLowerCase() === "contact.html";
    data = Buffer.from(await applySiteSettings(data.toString("utf8"), isContact), "utf8");
  }

  // Cache-Control: HTML fresh; versioned JS/CSS long-lived; other assets daily
  const hasVersion = /[?&]v=/.test((req && req.url) || "");
  let cache;
  if (ext === ".html") cache = "no-cache";
  else if ((ext === ".js" || ext === ".css") && hasVersion) cache = "public, max-age=31536000, immutable";
  else if (ext === ".js" || ext === ".css") cache = "public, max-age=300";
  else cache = "public, max-age=86400";

  // Gzip compress text responses when the client supports it
  const compressible = type.startsWith("text/") || type === "image/svg+xml";
  const acceptsGzip = compressible && /gzip/i.test((req && req.headers && req.headers["accept-encoding"]) || "");
  const body = acceptsGzip ? zlib.gzipSync(data) : data;
  const headers = {
    "Content-Type": type,
    "Cache-Control": cache,
    "Content-Length": body.length,
    "X-Content-Type-Options": "nosniff",
  };
  if (acceptsGzip) headers["Content-Encoding"] = "gzip";
  res.writeHead(200, headers);
  res.end(body);
}

async function handleRequest(req, res) {
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Health check
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // Sitemap (dynamic: static pages + published posts so the file stays in sync)
  if (url.pathname === "/sitemap.xml" && method === "GET") {
    const staticPages = [
      ["/", "1.0", "weekly", null],
      ["/about", "0.9", "monthly", "2026-01-01"],
      ["/how-it-works", "0.9", "monthly", "2026-01-01"],
      ["/blog", "0.9", "weekly", null],
      ["/faq", "0.9", "monthly", "2026-01-01"],
      ["/contact", "0.5", "monthly", "2026-01-01"],
      ["/privacy", "0.3", "yearly", null],
      ["/terms", "0.3", "yearly", null],
      ["/disclaimer", "0.3", "yearly", null],
      ["/pinterest-video-downloader-for-iphone", "0.8", "monthly", "2026-01-06"],
      ["/pinterest-video-downloader-for-android", "0.8", "monthly", "2026-01-08"],
      ["/pinterest-video-downloader-for-pc", "0.8", "monthly", "2026-01-10"],
      ["/pinterest-video-downloader-for-mac", "0.8", "monthly", "2026-01-12"],
      ["/pinterest-video-downloader-online", "0.7", "monthly", "2026-01-14"],
      ["/pinterest-video-downloader-hd", "0.7", "monthly", "2026-01-16"],
      ["/download-pinterest-gif", "0.7", "monthly", "2026-01-18"],
      ["/pinterest-image-downloader", "0.7", "monthly", "2026-01-20"],
      ["/pinterest-video-downloader-no-watermark", "0.7", "monthly", "2026-01-22"],
      ["/best-pinterest-video-downloader-2026", "0.6", "monthly", "2026-01-26"],
    ];
    const published = (await loadBlogPosts()).filter((p) => p.status === "published");
    let staticPostSlugs = [];
    try {
      staticPostSlugs = fs
        .readdirSync(path.join(PUBLIC_DIR, "blog"))
        .filter((f) => f.endsWith(".html"))
        .map((f) => f.slice(0, -".html".length));
    } catch {
      staticPostSlugs = [];
    }
    const staticPostDates = {
      "download-pinterest-videos-in-hd": "2026-09-08",
      "pinterest-video-downloader-free-no-sign-up": "2026-09-03",
      "download-pinterest-videos-without-watermark": "2026-09-01",
      "iphone-pinterest-video-download": "2026-08-29",
      "android-pinterest-video-download": "2026-08-25",
      "pinterest-video-wont-download": "2026-08-18",
      "save-pinterest-videos-offline": "2026-08-10",
      "pinterest-video-download-legal": "2026-08-01",
    };
    let urls = staticPages
      .map(
        ([loc, pri, freq, last]) => `  <url>
    <loc>https://pinterest-video-downloader-69a6.onrender.com${loc}</loc>
    ${last ? `    <lastmod>${last}</lastmod>\n` : ""}    <changefreq>${freq}</changefreq>
    <priority>${pri}</priority>
  </url>`
      )
      .concat(
        staticPostSlugs.map((slug) => {
          const last = staticPostDates[slug] || "";
          return `  <url>
    <loc>https://pinterest-video-downloader-69a6.onrender.com/blog/${encodeURIComponent(slug)}</loc>
    ${last ? `    <lastmod>${last}</lastmod>\n` : ""}    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        })
      )
      .concat(
        published.map((p) => {
          const last = p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : (p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "");
          return `  <url>
    <loc>https://pinterest-video-downloader-69a6.onrender.com/blog/${encodeURIComponent(p.slug)}</loc>
    ${last ? `    <lastmod>${last}</lastmod>\n` : ""}    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        })
      );
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Content-Length": Buffer.byteLength(xml) });
    res.end(xml);
    return;
  }

  // Download endpoint
  if (url.pathname === "/api/download" && method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }

    try {
      const result = await downloadPinterestVideo(input?.url);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, error.status || 502, {
        error:
          error.status === 502 || !error.status
            ? "Pinterest could not be reached right now. Please try again."
            : error.message,
      });
    }
    return;
  }

  // File download proxy â€” makes the browser save the file instead of playing it
  if (url.pathname === "/api/file" && method === "GET") {
    const target = url.searchParams.get("url");
    const rawName = url.searchParams.get("name") || "pinterest-video.mp4";
    if (!target || !/^https?:\/\//i.test(target)) {
      sendJson(res, 400, { error: "Invalid file URL." });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(target, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "video/*,application/octet-stream,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        sendJson(res, 502, { error: `The video source returned HTTP ${response.status}.` });
        return;
      }
      const fileName = path.basename(rawName).replace(/[^\w.\-]+/g, "_") || "pinterest-video.mp4";
      const headers = {
        "Content-Type": response.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      };
      const contentLength = response.headers.get("content-length");
      if (contentLength) headers["Content-Length"] = contentLength;
      res.writeHead(200, headers);
      const reader = response.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(Buffer.from(value));
        pump();
      };
      await pump();
    } catch {
      if (!res.headersSent) {
        sendJson(res, 502, { error: "Could not download the file. Please try again." });
      } else {
        res.end();
      }
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  // ---------- AI Assistant ----------
  if (url.pathname === "/api/ai/status") {
    sendJson(res, 200, await aiStatus());
    return;
  }

  if (url.pathname === "/api/ai/generate" && method === "POST") {
    const input = await readJsonBody(req);
    if (!input) {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }
    const action = String(input.action || "");
    if (!AI_ACTIONS.has(action)) {
      sendJson(res, 400, { error: `Unknown AI action "${action}".` });
      return;
    }
    try {
      const { system, user } = buildAiRequest(action, input);
      const result = await runAi(user, system);
      sendJson(res, 200, { action, result });
    } catch (error) {
      sendJson(res, error.status || 502, { error: error.message || "AI request failed." });
    }
    return;
  }

  // Admin page
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    const adminPath = path.join(PUBLIC_DIR, "admin.html");
    try {
      await sendFile(res, adminPath, req);
    } catch {
      sendJson(res, 404, { error: "Admin page not found." });
    }
    return;
  }

  // Public site settings (used by layout.js / footer to render social + contact)
  if (url.pathname === "/api/site/settings" && method === "GET") {
    sendJson(res, 200, await loadSettings());
    return;
  }

  // ---------- Admin session auth (optional) ----------
  if (await adminConfigured()) {
    if (url.pathname === "/api/admin/login" && method === "POST") {
      const input = await readJsonBody(req);
      const usernameOk = !ADMIN_USERNAME || String(input?.username || "") === ADMIN_USERNAME;
      const passwordOk = await adminPasswordMatches(input?.password);
      const ok = usernameOk && passwordOk;
      if (ok) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie":
            "pinsaver_admin=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        sendJson(res, 401, { error: "Wrong username or password." });
      }
      return;
    }

    if (url.pathname === "/api/admin/logout" && method === "POST") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "pinsaver_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const adminProtected =
      url.pathname === "/api/posts" ||
      /^\/api\/posts\//.test(url.pathname) ||
      url.pathname.startsWith("/api/admin/");
    if (adminProtected && !(await adminAuthed(req))) {
      sendJson(res, 401, { error: "Admin login required." });
      return;
    }
  }

  // ---------- Admin settings API ----------
  if (url.pathname === "/api/admin/settings" && method === "GET") {
    sendJson(res, 200, await loadSettings());
    return;
  }

  if (url.pathname === "/api/admin/settings" && method === "POST") {
    const input = await readJsonBody(req);
    if (!input) {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }
    const clean = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = typeof input[key] === "string" ? input[key].trim() : "";
      if (key === "defaultMetaDescription") clean[key] = value.slice(0, 320).replace(/\s+/g, " ");
      else if (key === "gscVerifyTag") clean[key] = value.slice(0, 2000);
      else clean[key] = value.slice(0, 500);
    }
    const savedSettings = await saveSettings(clean);
    sendJson(res, 200, { ok: true, settings: savedSettings });
    return;
  }

  if (url.pathname === "/api/admin/change-password" && method === "POST") {
    const input = await readJsonBody(req);
    if (!input) {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }
    const current = String(input.currentPassword || "");
    const next = String(input.newPassword || "");
    const confirm = String(input.confirmPassword || "");
    if (!(await adminPasswordMatches(current))) {
      sendJson(res, 401, { error: "Current password is incorrect." });
      return;
    }
    if (next.length < 6) {
      sendJson(res, 400, { error: "New password must be at least 6 characters." });
      return;
    }
    if (next !== confirm) {
      sendJson(res, 400, { error: "New password and confirm do not match." });
      return;
    }
    const salt = crypto.randomBytes(16).toString("hex");
    await saveAdminRecord({ salt, hash: hashPassword(next, salt), updatedAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true });
    return;
  }

  // ---------- Blog post CMS API ----------
  if (url.pathname === "/api/posts" && method === "GET") {
    const status = url.searchParams.get("status");
    const posts = await loadBlogPosts();
    const result = status ? posts.filter((p) => p.status === status) : posts;
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/posts" && method === "POST") {
    const input = await readJsonBody(req);
    if (!input) {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }
    const posts = await loadBlogPosts();
    const rawSlug = slugify(input.slug || input.title);
    const now = new Date().toISOString();
    const post = {
      id: createId(),
      title: String(input.title || "").trim() || "Untitled Post",
      slug: uniqueSlug(posts, rawSlug || "post"),
      content: String(input.content || ""),
      excerpt: String(input.excerpt || ""),
      category: String(input.category || "tips"),
      author: String(input.author || "PinSaver Team"),
      coverImage: String(input.coverImage || ""),
      tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : [],
      faqs: Array.isArray(input.faqs)
        ? input.faqs
            .filter((f) => f && String(f.question || "").trim() && String(f.answer || "").trim())
            .map((f) => ({ question: String(f.question).trim(), answer: String(f.answer).trim() }))
        : [],
      metaTitle: String(input.metaTitle || ""),
      metaDescription: String(input.metaDescription || ""),
      readTime: readTimeFor(input.content),
      status: input.status === "draft" ? "draft" : "published",
      createdAt: now,
      updatedAt: now,
    };
    const savedPost = await createBlogPost(post);
    sendJson(res, 201, savedPost);
    return;
  }

  const postMatch = url.pathname.match(/^\/api\/posts\/([\w-]+)$/);
  if (postMatch) {
    const id = postMatch[1];
    const posts = await loadBlogPosts();
    const index = posts.findIndex((p) => p.id === id);

    if (method === "GET") {
      const post = posts[index];
      if (!post) {
        sendJson(res, 404, { error: "Post not found." });
        return;
      }
      sendJson(res, 200, post);
      return;
    }

    if (method === "PUT") {
      if (index === -1) {
        sendJson(res, 404, { error: "Post not found." });
        return;
      }
      const input = await readJsonBody(req);
      if (!input) {
        sendJson(res, 400, { error: "Invalid JSON body." });
        return;
      }
      const existing = posts[index];
      const rawSlug = slugify(input.slug || input.title || existing.slug);
      posts[index] = {
        ...existing,
        ...input,
        id: existing.id,
        slug: uniqueSlug(posts, rawSlug || existing.slug, existing.id),
        readTime: readTimeFor(input.content ?? existing.content),
        updatedAt: new Date().toISOString(),
      };
      const savedPost = await updateBlogPost(posts[index]);
      sendJson(res, 200, savedPost);
      return;
    }

    if (method === "DELETE") {
      if (index === -1) {
        sendJson(res, 404, { error: "Post not found." });
        return;
      }
      const [removed] = posts.splice(index, 1);
      await deleteBlogPost(removed.id);
      sendJson(res, 200, removed);
      return;
    }
  }

  // ---------- Clean URLs: 301 redirect legacy .html pages ----------
  const LEGACY_REDIRECTS = {
    "/index.html": "/",
    "/about.html": "/about",
    "/faq.html": "/faq",
    "/how-it-works.html": "/how-it-works",
    "/contact.html": "/contact",
    "/privacy.html": "/privacy",
    "/terms.html": "/terms",
    "/blog.html": "/blog",
  };
  const redirectTarget = LEGACY_REDIRECTS[url.pathname] ||
    (url.pathname.match(/^\/blog\/([\w-]+)\.html$/) ? `/blog/${url.pathname.match(/^\/blog\/([\w-]+)\.html$/)[1]}` : null) ||
    (url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : null);

  if (redirectTarget) {
    const location = redirectTarget + (url.search || "");
    res.writeHead(301, {
      Location: location,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "max-age=86400",
    });
    res.end("301 Moved Permanently");
    return;
  }

  // ---------- Dynamic CMS blog post pages ----------
  const blogPage = url.pathname.match(/^\/blog\/([\w-]+)$/);
  if (blogPage) {
    let slug;
    try {
      slug = decodeURIComponent(blogPage[1]);
    } catch {
      slug = blogPage[1];
    }
    const posts = await loadBlogPosts();
    const post = getPostBySlug(posts, slug);
    if (post && post.status === "published") {
      const pageHtml = await applySiteSettings(renderBlogPostPage(post, pickRelated(posts, slug)), false);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(pageHtml),
      });
      res.end(pageHtml);
      return;
    }
  }

  // Static files
  const filePath = resolvePublicPath(url.pathname === "/" ? "/" : url.pathname);
  if (filePath) {
    await sendFile(res, filePath, req);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 503;
    const message = status === 503
      ? "Storage service unavailable."
      : (error.message || "Request failed.");
    sendJson(res, status, { error: message });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PinSaver running at http://localhost:${PORT}`);
});
