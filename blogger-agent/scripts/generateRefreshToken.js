#!/usr/bin/env node
/**
 * One-time OAuth helper for the PinSaver Blogger agent.
 *
 * Runs the OAuth 2.0 "authorization code" flow against Google with
 * access_type=offline + prompt=consent so Google always hands back a
 * long-lived refresh token. The refresh token is what the CI job uses;
 * it never expires.
 *
 * Usage:
 *   node scripts/generateRefreshToken.js
 *   node scripts/generateRefreshToken.js --client-id=... --client-secret=...
 *
 * You will need "http://localhost:3000/oauth2callback" registered as an
 * Authorized redirect URI on the OAuth client in Google Cloud Console.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

const SCOPES = [
  'https://www.googleapis.com/auth/blogger',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const DEFAULT_PORT = 3000;
const DEFAULT_BLOG_ID = '7265988019810439292';
// Generous by default: you need time to log in and click Allow.
const CONSENT_TIMEOUT_MS = Number(process.env.OAUTH_TIMEOUT_SECONDS || 900) * 1000;

const args = parseArgs(process.argv.slice(2));

const clientId = args['client-id'] || process.env.GOOGLE_CLIENT_ID;
const clientSecret = args['client-secret'] || process.env.GOOGLE_CLIENT_SECRET;
const port = Number(args.port || process.env.OAUTH_PORT || DEFAULT_PORT);
const redirectUri = args['redirect-uri'] || `http://localhost:${port}/oauth2callback`;
const blogId = args['blog-id'] || process.env.BLOGGER_BLOG_ID || DEFAULT_BLOG_ID;

main().catch((err) => {
  console.error(`\n[fail] ${err.message}\n`);
  // Set the code instead of calling process.exit, which tears down sockets
  // mid-flight and makes Node abort with an assertion on Windows.
  process.exitCode = 1;
});

async function main() {
  console.log('\n=== PinSaver Blogger agent - OAuth refresh token setup ===\n');

  const { clientId: resolvedClientId, clientSecret: resolvedClientSecret } =
    await resolveCredentials();

  if (!resolvedClientId || !resolvedClientSecret) {
    throw new Error('Client ID and Client Secret are both required.');
  }

  console.log(`\nRedirect URI : ${redirectUri}`);
  console.log(`Scopes        : ${SCOPES}`);
  console.log('Blog ID       : ' + blogId);
  console.log('\nOpening your browser for consent...');

  const code = await waitForAuthCode({ port, redirectUri, clientId: resolvedClientId });

  console.log('\nExchanging auth code for tokens...');
  const tokens = await exchangeCodeForTokens({
    code,
    clientId: resolvedClientId,
    clientSecret: resolvedClientSecret,
    redirectUri,
  });

  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token.\n' +
        'This usually means consent was already granted for this client, so Google\n' +
        'skipped the consent screen. Revoke access at\n' +
        'https://myaccount.google.com/permissions then run this script again.',
    );
  }

  console.log('\nVerifying the refresh token against the Blogger API...');
  const identity = await verifyBloggerAccess({
    refreshToken: tokens.refresh_token,
    clientId: resolvedClientId,
    clientSecret: resolvedClientSecret,
    blogId,
  });

  saveToEnvFile({
    GOOGLE_CLIENT_ID: resolvedClientId,
    GOOGLE_CLIENT_SECRET: resolvedClientSecret,
    GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
    BLOGGER_BLOG_ID: blogId,
  });

  console.log('\n--- SUCCESS ---------------------------------------------');
  console.log(`Blog reachable : ${identity.title} (${identity.url})`);
  console.log(`Signed in as    : ${identity.email || 'unknown (email scope not returned)'}`);
  console.log('\nPaste this refresh token into the GitHub secret GOOGLE_REFRESH_TOKEN:');
  console.log('\n' + tokens.refresh_token);
  console.log('\nIt was also written to ' + ENV_PATH + ' (git-ignored).');
  console.log('-------------------------------------------------------------\n');
}

function waitForAuthCode({ port, redirectUri, clientId }) {
  return new Promise((resolve, reject) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');

    const authUrlString = authUrl.toString();

    // A long URL copied out of a wrapped terminal gets truncated, which is
    // what causes "invalid_request: response_type missing". Serving the link
    // from a local page means it is never retyped or pasted by hand.
    assertAuthUrl(authUrlString);

    const landingUrl = `http://localhost:${port}/`;

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Always release the port, on success and on failure alike. Leaving it
      // open makes the process hang and then trip a Node assertion on exit.
      server.close();
      fn(value);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(consentPage(authUrlString, landingUrl));
        return;
      }

      if (url.pathname === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }

      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not found</h1>');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        const description =
          url.searchParams.get('error_description') || 'Authorization was denied.';
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Authorization failed</h1><p>${escapeHtml(description)}</p>`);
        finish(reject, new Error(`${error}: ${description}`));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Missing authorization code</h1>');
        finish(reject, new Error('Google redirected back without an authorization code.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8">' +
          '<body style="font-family:system-ui;text-align:center;padding:60px">' +
          '<h1>Authorized</h1><p>You can close this tab and return to your terminal.</p>' +
          '</body>',
      );
      finish(resolve, code);
    });

    server.on('error', (err) => {
      finish(reject, new Error(`Could not start local server on port ${port}: ${err.message}`));
    });

    const timer = setTimeout(() => {
      finish(reject, new Error('Timed out waiting for the consent screen to complete.'));
      server.close();
    }, CONSENT_TIMEOUT_MS);

    server.listen(port, () => {
      console.log('\nOpen this page in your browser:\n');
      console.log('  ' + landingUrl + '\n');
      console.log('It has one button. Click it, sign in, then press Allow.\n');
      console.log(`Waiting for consent (${formatTimeout(CONSENT_TIMEOUT_MS)})...\n`);
      openBrowser(landingUrl);
    });
  });
}

function formatTimeout(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `up to ${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `up to ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Fail loudly here rather than after a confusing Google 400. */
function assertAuthUrl(urlString) {
  const parsed = new URL(urlString);
  const required = ['client_id', 'redirect_uri', 'response_type', 'scope'];

  for (const param of required) {
    if (!parsed.searchParams.get(param)) {
      throw new Error(`Built an invalid auth URL: "${param}" is missing.`);
    }
  }

  if (parsed.searchParams.get('response_type') !== 'code') {
    throw new Error('Built an invalid auth URL: response_type must be "code".');
  }
}

function consentPage(authUrl, landingUrl) {
  const safeUrl = escapeHtml(authUrl);

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PinSaver Blogger agent - Google authorization</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background:#0f1115; color:#e6e6e6;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
  .card { background:#171a21; border:1px solid #2a2f3a; border-radius:14px; padding:40px; max-width:520px; width:100%; }
  h1 { margin:0 0 8px; font-size:20px; }
  p { color:#a0a6b4; line-height:1.6; margin:0 0 20px; font-size:14px; }
  ol { color:#a0a6b4; line-height:1.8; font-size:14px; padding-left:20px; margin:0 0 24px; }
  a.btn { display:block; text-align:center; background:#e60023; color:#fff; text-decoration:none;
          padding:14px 20px; border-radius:8px; font-weight:600; font-size:15px; }
  a.btn:hover { background:#ff1744; }
</style>
<div class="card">
  <h1>Connect your Blogger blog</h1>
  <p>The PinSaver agent needs permission to publish posts to your blog. Nothing is shared with anyone else.</p>
  <ol>
    <li>Click the button below.</li>
    <li>Sign in with the Google account that <strong>owns the blog</strong>.</li>
    <li>Review the permissions and press <strong>Allow</strong>.</li>
  </ol>
  <a class="btn" href="${safeUrl}">Authorize with Google</a>
</div>
</html>`;
}

async function exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const json = await readJson(res);

  if (!res.ok) {
    throw new Error(
      `Token exchange failed (${res.status}): ${json.error_description || json.error || 'unknown error'}`,
    );
  }

  return json;
}

async function verifyBloggerAccess({ refreshToken, clientId, clientSecret, blogId }) {
  const accessToken = await getAccessToken({ refreshToken, clientId, clientSecret });

  const [blogRes, profileRes] = await Promise.all([
    fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!blogRes.ok) {
    const err = await readJson(blogRes);
    throw new Error(
      `Could not read blog ${blogId} (${blogRes.status}): ${err.error?.message || JSON.stringify(err)}\n` +
        'Check that the Blog ID is correct and that this Google account owns or can edit the blog.',
    );
  }

  const blog = await blogRes.json();
  const profile = profileRes.ok ? await profileRes.json() : {};

  return { title: blog.name, url: blog.url, email: profile.email };
}

async function getAccessToken({ refreshToken, clientId, clientSecret }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const json = await readJson(res);

  if (!res.ok) {
    throw new Error(
      `Could not mint an access token (${res.status}): ${json.error_description || json.error}`,
    );
  }

  return json.access_token;
}

function saveToEnvFile(values) {
  let existing = '';
  if (fs.existsSync(ENV_PATH)) {
    existing = fs.readFileSync(ENV_PATH, 'utf8');
  }

  const lines = Object.entries(values).map(([key, value]) => {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    return pattern.test(existing) ? existing.replace(pattern, line) : line;
  });

  const merged = existing.trim() ? `${existing.trim()}\n${lines.join('\n')}\n` : `${lines.join('\n')}\n`;
  fs.writeFileSync(ENV_PATH, merged, 'utf8');
  fs.chmodSync(ENV_PATH, 0o600);
}

function openBrowser(url) {
  // rundll32 + FileProtocolHandler is the most reliable way to hand a URL to
  // the default browser on Windows without a shell-quoting dependency.
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* auto-open is best effort; the console message has the address */
  }
}

/**
 * Ask for anything not supplied via env or flags.
 *
 * One readline interface is used for the whole exchange. Creating a new
 * interface per question closes stdin, which loses buffered input and can
 * hang when stdin is not an interactive terminal.
 */
async function resolveCredentials() {
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  // Piped or redirected stdin: readline buffers whole chunks, which can leave
  // the second question waiting on input it already consumed. Read it all once.
  if (!stdin.isTTY) {
    const lines = (await readStream(stdin)).split(/\r?\n/);
    const [pipedId, pipedSecret] = lines.map((line) => line.trim());
    return {
      clientId: clientId || pipedId,
      clientSecret: clientSecret || pipedSecret,
    };
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const askedId = clientId || (await rl.question('Google OAuth Client ID: '));
    const askedSecret =
      clientSecret || (await rl.question('Google OAuth Client Secret: '));

    return { clientId: askedId.trim(), clientSecret: askedSecret.trim() };
  } finally {
    rl.close();
  }
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      data += chunk;
    });
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) parsed[match[1]] = match[2] ?? true;
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
