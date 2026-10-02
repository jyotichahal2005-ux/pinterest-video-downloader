/**
 * Groq (OpenAI-compatible) content generation.
 *
 * Two jobs:
 *   1. generateTopicVariation() - spins a fresh, never-used angle off a base topic
 *   2. generatePost()          - writes the full SEO blog post as Blogger-ready HTML
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// llama-3.3-70b-versatile was retired by Groq; gpt-oss-120b is the current
// strongest long-form model on the free tier. Override with GROQ_MODEL.
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

export const MIN_WORDS = 800;
export const MAX_WORDS = 1200;
export const MIN_SITE_LINKS = 3;
// The Groq free tier rate-limits bursts, so keep QA attempts short and
// let callGroq's backoff handle throttling.
const MAX_ATTEMPTS = 2;

const DEFAULTS = {
  model: DEFAULT_MODEL,
  temperature: 0.85,
  // Reasoning models spend tokens on hidden reasoning before the answer,
  // so this needs real headroom for a 1200-word article.
  max_tokens: 16000,
  timeoutMs: 300_000,
};

/**
 * Ask the model for a new, specific angle on a base topic so the agent does not
 * publish twenty posts with the same headline intent.
 */
export async function generateTopicVariation({ apiKey, baseTopic, usedTopics = [], site, model, logger }) {
  const log = logger || console.log.bind(console);
  log(`  brainstorming a fresh angle for "${baseTopic}"`);

  const prompt = [
    'You are an SEO content strategist for a Pinterest video downloader site.',
    `The tool being promoted is ${site.name} (${site.url}) - ${site.description}`,
    '',
    `Base topic: "${baseTopic}"`,
    '',
    'Topics already published, which you must NOT repeat:',
    ...(usedTopics.length ? usedTopics.map((t) => `- ${t}`) : ['(none yet)']),
    '',
    'Produce ONE new blog post title about saving Pinterest videos. It must:',
    '- be a different, more specific angle than the base topic and every listed title',
    '- include the phrase "Pinterest video" naturally',
    '- sound like a real how-to guide a normal person would search for',
    '- be between 45 and 75 characters',
    '',
    'Reply with JSON only, no prose, no markdown fence:',
    '{"title":"..."}',
  ].join('\n');

  const raw = await callGroq({
    apiKey,
    model,
    temperature: 1,
    max_tokens: 300,
    messages: [
      { role: 'system', content: 'You output only compact JSON. No commentary.' },
      { role: 'user', content: prompt },
    ],
    jsonMode: true,
    logger: log,
  });

  const parsed = extractJson(raw);
  const title = String(parsed.title || '').trim();

  if (!title) {
    throw new Error('Model returned no usable title for the topic variation.');
  }

  log(`  new angle: "${title}"`);
  return { title, baseTopic, origin: 'ai-variation' };
}

/**
 * Write the complete post. Returns Blogger-ready HTML in `content`.
 *
 * The model routinely under-writes and leaves HTML tags unclosed, so every
 * draft is QA'd and, if it fails, the model is sent its own draft back with
 * specific complaints and asked for a full rewrite.
 */
export async function generatePost({ apiKey, topic, site, audience, labels = [], model, logger }) {
  const log = logger || console.log.bind(console);
  log(`  writing post: "${topic}"`);

  const messages = [
    {
      role: 'system',
      content:
        'You are a senior SEO content writer. You write genuinely useful, specific, ' +
        'human-sounding how-to guides. You never pad word count with filler and you ' +
        'always emit complete, correctly closed HTML.',
    },
    { role: 'user', content: buildPostPrompt({ topic, site, audience, labels }) },
  ];

  let result = null;
  let lastIssues = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await callGroq({
      apiKey,
      model,
      temperature: 0.8,
      max_tokens: 16000,
      messages,
      jsonMode: true,
      logger: log,
    });

    const parsed = extractJson(raw);
    const content = ensureHtml(String(parsed.content || '').trim());

    if (content.length < 500) {
      throw new Error(`Generated content looks truncated (${content.length} chars).`);
    }

    const wordCount = countWords(stripHtml(content));
    const backlinks = countSiteLinks(content, site.url);

    lastIssues = [];
    if (wordCount < MIN_WORDS) lastIssues.push(`only ${wordCount} words, need at least ${MIN_WORDS}`);
    if (wordCount > MAX_WORDS) lastIssues.push(`${wordCount} words, needs trimming to ${MAX_WORDS} or fewer`);
    if (backlinks < MIN_SITE_LINKS) {
      lastIssues.push(`only ${backlinks} link(s) to ${site.url}, need at least ${MIN_SITE_LINKS}`);
    }
    if (!/<h2[\s>]/i.test(content)) lastIssues.push('no <h2> section headings');

    result = {
      title: String(parsed.title || topic).trim(),
      content,
      metaDescription: String(parsed.metaDescription || '').trim(),
      labels,
      topic,
      wordCount,
      backlinks,
    };

    if (!lastIssues.length) {
      log(`  passed QA on attempt ${attempt}`);
      break;
    }

    log(`  attempt ${attempt} failed QA: ${lastIssues.join('; ')}`);

    if (attempt < MAX_ATTEMPTS) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: buildRepairPrompt(lastIssues, site) });
      log('  rewriting...');
      await sleep(20_000);
    }
  }

  if (lastIssues.length) {
    log(`  WARNING: publishing anyway despite: ${lastIssues.join('; ')}`);
  }

  log(`  done: ${result.wordCount} words, ${result.backlinks} backlink(s), ${result.content.length} chars of HTML`);

  return result;
}

function buildRepairPrompt(issues, site) {
  return [
    'That draft did not pass review. Problems:',
    ...issues.map((issue) => `- ${issue}`),
    '',
    'Rewrite the ENTIRE post from scratch as the same JSON object',
    '({"title","metaDescription","content"}). Do not reply with a diff or a fragment.',
    '',
    'While rewriting:',
    `- Aim for roughly 950-1100 words so you clear the minimum with room to spare.`,
    '- Expand the thin sections with genuinely useful detail: extra steps, what each option means,',
    '  common mistakes, and what to do when something fails. Never pad with filler sentences.',
    `- Include at least ${MIN_SITE_LINKS} separate anchor links to ${site.url} with different anchor text.`,
    '- Close every HTML tag you open. End with a complete sentence followed by </p>.',
    '- Do not stop mid-sentence and do not truncate the JSON.',
  ].join('\n');
}

function buildPostPrompt({ topic, site, audience, labels }) {
  return [
    `Write one complete SEO blog post for the topic: "${topic}"`,
    '',
    'PRODUCT BEING PROMOTED',
    `- Name: ${site.name}`,
    `- URL: ${site.url}`,
    `- What it is: ${site.description}`,
    '',
    `AUDIENCE: ${audience}`,
    '',
    'HARD REQUIREMENTS',
    `- Write AT LEAST ${MIN_WORDS} words. A draft under ${MIN_WORDS} words will be rejected and rewritten,`,
    '  so aim for 950-1100 words to clear the bar comfortably. Do not pad with filler.',
    '- Format: clean, correctly closed HTML that Blogger will accept.',
    '- Every opening tag must have its closing tag. Never end mid-sentence or leave a <p> unclosed.',
    `- Start with a short intro paragraph (2-3 sentences) that states what the reader will achieve and includes the focus phrase.`,
    '- Write at least 6 <h2> sections. Each one needs 120+ words of real explanation, not two sentences.',
    '- Use <h3> subheadings where a section has distinct sub-points.',
    '- Use numbered <ol><li> steps for any procedure, and <ul><li> for tips or lists.',
    '- Include at least one troubleshooting subsection: what breaks, why, and the fix.',
    '- Do NOT include an <h1>. Blogger renders the post title itself.',
    `- Include a FAQ section near the end, as <h2> plus at least 4 <h3> question headings with 40+ word answers.`,
    '',
    'LINKING RULES (important)',
    `- Include at least ${MIN_SITE_LINKS} separate anchor links to ${site.url}, spread through the body copy where they actually help the reader.`,
    `- Every mention of ${site.name} must be an anchor link: <a href="${site.url}">varied anchor text</a>.`,
    '- Vary the anchor text (e.g. "PinSaver", "this free Pinterest video downloader", "try PinSaver online", "the PinSaver tool"). Never use the same anchor text twice.',
    '- Close every call-to-action with a clear next step for the reader.',
    '- Links must use the exact href above. Do not invent other URLs, do not cite fake studies, and do not invent statistics.',
    '',
    'WRITING RULES',
    '- Write like a helpful human, not a keyword robot. Short paragraphs, concrete steps.',
    `- Accuracy over persuasion. You may only state features that were given to you in the PRODUCT section above.`,
    '  Never invent quality claims (720p, 1080p, 4K), speed claims, privacy guarantees, file limits,',
    '  watermarks, or pricing. If a capability is not listed above, do not assert it - instead point',
    '  the reader to the tool page where they can confirm it for themselves.',
    '- No fake statistics, no invented expert quotes, no fake citations or study references.',
    '- No emoji, no markdown syntax, no placeholder text like [insert link here].',
    '',
    'LABELS (Blogger categories) to attach: ' + (labels.length ? labels.join(', ') : 'none'),
    '',
    'REPLY WITH JSON ONLY, no markdown fence, in exactly this shape:',
    '{"title":"...","metaDescription":"...under 160 characters...","content":"<p>...</p><h2>...</h2>..."}',
  ].join('\n');
}

export async function callGroq({
  apiKey,
  model,
  temperature,
  max_tokens,
  messages,
  jsonMode,
  logger,
  maxRetries = 3,
}) {
  const log = logger || console.log.bind(console);
  const body = {
    model: model || DEFAULTS.model,
    temperature,
    max_tokens,
    messages,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  // gpt-oss spends hidden reasoning tokens unless told to keep it short.
  if (String(body.model).includes('gpt-oss')) {
    body.reasoning_effort = 'low';
  }

  log(`  calling ${body.model}...`);

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await requestGroq({ apiKey, body, logger: log });
      return result;
    } catch (err) {
      // Free tier throttles bursts; a short backoff clears it most of the time.
      if (err.retryable && attempt < maxRetries) {
        const waitMs = 15_000 * attempt;
        log(`  ${err.message} Retrying in ${waitMs / 1000}s (attempt ${attempt}/${maxRetries})...`);
        await sleep(waitMs);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

async function requestGroq({ apiKey, body, logger }) {
  const log = logger || console.log.bind(console);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULTS.timeoutMs);

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${DEFAULTS.timeoutMs}ms.`);
    }
    const netErr = new Error(`Could not reach Groq: ${err.message}`);
    netErr.retryable = true;
    throw netErr;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Groq returned a non-JSON response (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    const detail = json?.error?.message || text.slice(0, 400);
    if (res.status === 401) {
      throw new Error('Groq rejected the API key (401). Check the GROQ_API_KEY secret.');
    }
    if (res.status === 429) {
      const err = new Error('Groq rate limit hit (429). Free tier allows limited requests per minute.');
      err.retryable = true;
      throw err;
    }
    if (res.status >= 500) {
      const err = new Error(`Groq server error (${res.status}): ${detail}`);
      err.retryable = true;
      throw err;
    }
    throw new Error(`Groq request failed (HTTP ${res.status}): ${detail}`);
  }

  const choice = json?.choices?.[0];
  const finishReason = choice?.finish_reason;

  if (finishReason === 'length') {
    const produced = countWords(stripHtml(choice?.message?.content || ''));
    throw new Error(
      `Model hit the ${body.max_tokens} token limit and the answer was cut off ` +
        `(${produced} words so far). Raise DEFAULTS.max_tokens or shorten the prompt.`,
    );
  }

  // gpt-oss puts its chain of thought in `reasoning`; the answer is in `content`.
  const content = choice?.message?.content ?? '';
  if (!content && choice?.message?.reasoning) {
    throw new Error('Model produced only reasoning and no final answer.');
  }

  return content;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pull a JSON object out of a model response, tolerating stray fences or prose. */
export function extractJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Model returned an empty response.');

  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }

  throw new Error(`Could not parse model output as JSON. First 300 chars: ${text.slice(0, 300)}`);
}

/**
 * Close any HTML tags the model left open.
 *
 * gpt-oss regularly ends a post mid-paragraph, and Blogger rejects or
 * mis-renders unbalanced markup, so we repair it before publishing.
 */
export function balanceHtml(html) {
  const source = String(html || '')
    .replace(/^\s*```(?:html)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col']);
  const stack = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

  let out = '';
  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(source)) !== null) {
    out += source.slice(cursor, match.index);
    cursor = tagPattern.lastIndex;

    const tag = match[1].toLowerCase();
    const isClosing = match[0].startsWith('</');

    if (isClosing) {
      const openIndex = stack.lastIndexOf(tag);
      if (openIndex === -1) continue; // stray closing tag, drop it
      while (stack.length > openIndex) out += `</${stack.pop()}>`;
    } else {
      out += match[0];
      if (!voidTags.has(tag) && !match[0].endsWith('/>')) stack.push(tag);
    }
  }

  out += source.slice(cursor);
  while (stack.length) out += `</${stack.pop()}>`;

  return out.trim();
}

/**
 * The model sometimes ignores the "reply in HTML" instruction and returns
 * Markdown instead. Convert it so Blogger always receives real markup.
 */
export function ensureHtml(input) {
  const source = String(input || '').trim();
  if (/<(?:p|h2|h3|h4|ul|ol|div|section|table)[\s>]/i.test(source)) {
    return balanceHtml(source);
  }
  return balanceHtml(markdownToHtml(source));
}

function markdownToHtml(markdown) {
  const codeBlocks = [];
  const staged = markdown.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match.replace(/^```[a-z]*\r?\n?/i, '').replace(/```$/, '').trim());
    return ` BLOCK${codeBlocks.length - 1} `;
  });

  const html = [];
  let listType = null;
  let paragraph = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (const rawLine of staged.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const block = /^ BLOCK(\d+) $/.exec(trimmed);
    if (block) {
      flushParagraph();
      closeList();
      html.push(`<pre><code>${escapeHtml(codeBlocks[Number(block[1])])}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      // Never emit <h1>: Blogger renders the post title itself.
      const level = Math.min(Math.max(heading[1].length, 2), 3);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inlineMarkdown(numbered[1])}</li>`);
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  return html.join('\n');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function countSiteLinks(content, siteUrl) {
  return (String(content).match(new RegExp(escapeRegExp(siteUrl), 'g')) || []).length;
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
