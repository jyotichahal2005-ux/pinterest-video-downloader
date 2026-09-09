import { Router, type IRouter } from "express";
import fetch from "node-fetch";
import {
  DownloadPinterestVideoBody,
  DownloadPinterestVideoResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const PINTEREST_HOSTS = new Set(["pinterest.com", "www.pinterest.com"]);
const SHORT_HOST = "pin.it";
const PINTEREST_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 15_000;

type VideoCandidate = {
  url: string;
  label: string;
  quality: number;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(value: string): string {
  return decodeHtml(value)
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function getMetaContent(html: string, property: string): string | null {
  const tagPattern = /<meta\b[^>]*>/gi;
  const attributePattern = /([:\w-]+)\s*=\s*(['"])(.*?)\2/gi;

  for (const tag of html.matchAll(tagPattern)) {
    const attributes = new Map<string, string>();
    for (const attribute of tag[0].matchAll(attributePattern)) {
      attributes.set(attribute[1].toLowerCase(), decodeHtml(attribute[3]));
    }

    if (
      attributes.get("property")?.toLowerCase() === property.toLowerCase() ||
      attributes.get("name")?.toLowerCase() === property.toLowerCase()
    ) {
      const content = attributes.get("content");
      if (content) {
        return normalizeUrl(content);
      }
    }
  }

  return null;
}

function videoLabel(url: string, index: number): { label: string; quality: number } {
  const qualityMatch = url.match(/(?:^|[/_-])(480|720|1080)(?:p)?(?:[/_.?-]|$)/i);
  if (qualityMatch) {
    return { label: `${qualityMatch[1]}p`, quality: Number(qualityMatch[1]) };
  }

  const dimensionMatch = url.match(/(?:^|[/_-])(\d{3,4})x\d{3,4}(?:[/_.?-]|$)/i);
  if (dimensionMatch) {
    return { label: `${dimensionMatch[1]}p`, quality: Number(dimensionMatch[1]) };
  }

  return { label: `Video ${index + 1}`, quality: 0 };
}

function extractVideoCandidates(html: string): VideoCandidate[] {
  const normalizedHtml = normalizeUrl(html);
  const urlPattern =
    /https?:\/\/v1\.pinimg\.com\/videos\/[^"'<>\\\s]+?\.mp4(?:\?[^"'<>\\\s]*)?/gi;
  const candidates = new Map<string, VideoCandidate>();

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
    .sort((left, right) => right.quality - left.quality)
    .map(({ url, label }) => ({ url, label, quality: 0 }));
}

function isPinterestUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "http:" || parsed.protocol === "https:"
    ) && (PINTEREST_HOSTS.has(host) || host === SHORT_HOST);
  } catch {
    return false;
  }
}

function isPinPage(value: string): boolean {
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

async function fetchPinterestPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": PINTEREST_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Pinterest returned HTTP ${response.status}`);
    }

    return {
      html: await response.text(),
      finalUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.post("/download", async (req, res): Promise<void> => {
  const parsedBody = DownloadPinterestVideoBody.safeParse(req.body);
  if (!parsedBody.success || !isPinterestUrl(parsedBody.data.url)) {
    res.status(400).json({ error: "Enter a valid Pinterest pin link." });
    return;
  }

  const requestedUrl = parsedBody.data.url;

  try {
    const { html, finalUrl } = await fetchPinterestPage(requestedUrl);

    if (!isPinPage(finalUrl)) {
      res.status(400).json({
        error: "That link does not point to a Pinterest pin.",
      });
      return;
    }

    const videos = extractVideoCandidates(html);
    const fallbackVideo = getMetaContent(html, "og:video:secure_url");
    if (videos.length === 0 && fallbackVideo?.toLowerCase().includes(".mp4")) {
      const { label } = videoLabel(fallbackVideo, 0);
      videos.push({ url: fallbackVideo, label, quality: 0 });
    }

    if (videos.length === 0) {
      res.status(400).json({
        error: "No video was found on that Pinterest pin.",
      });
      return;
    }

    const title =
      getMetaContent(html, "og:title") ??
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
      "Pinterest video";
    const thumbnail = getMetaContent(html, "og:image");

    const result = DownloadPinterestVideoResponse.parse({
      title: decodeHtml(title).trim() || "Pinterest video",
      thumbnail,
      videos: videos.map(({ url, label }) => ({ url, label })),
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Pinterest error";
    req.log.warn({ err: message, url: requestedUrl }, "Pinterest fetch failed");
    res.status(502).json({
      error: "Pinterest could not be reached right now. Please try again.",
    });
  }
});

export default router;