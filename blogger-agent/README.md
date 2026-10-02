# PinSaver Blogger Agent

Automated blogging agent. Every run it picks an unused topic, writes a full SEO
article with Groq, publishes it to the PinSaver guides blog through the Blogger
API, and logs it so the same topic is never repeated.

Each post contains contextual links back to
**https://pinterest-video-downloader-69a6.onrender.com**, which is the point of
the whole setup: daily content on a real blog pointing at the product site.

## How a run works

```
pick unused topic  ->  write post (Groq)  ->  QA  ->  publish (Blogger)  ->  log
```

1. **Topic selection** - walks `config/topics.json` in order and takes the first
   topic not present in `logs/published.json`. When all 20 are used up it asks
   Groq for a fresh angle on the least-recently-used base topic.
2. **Generation** - `src/generateContent.js` writes an 800-1200 word article as
   HTML, with headings, steps, a troubleshooting section, an FAQ, and several
   anchor links to the product URL.
3. **QA** - the draft is checked for word count, site links, and headings. If it
   fails, the model gets its own draft back with specific complaints and one
   rewrite attempt. Unclosed HTML tags are repaired automatically, and if the
   model replies in Markdown it is converted to HTML.
4. **Publish** - `src/publishToBlogger.js` swaps the refresh token for an access
   token and creates a `publish` status post via Blogger API v3.
5. **Log** - the entry is appended to `logs/published.json`, which the workflow
   commits back to the repo so history survives the next checkout.

## Project layout

| Path | Purpose |
|---|---|
| `config/topics.json` | Topic list plus site metadata (name, URL, audience) |
| `src/index.js` | Pipeline entry point and `--dry-run` / `--verify` modes |
| `src/generateContent.js` | Groq calls, prompt, QA loop, HTML repair |
| `src/publishToBlogger.js` | OAuth token refresh and Blogger API v3 calls |
| `logs/published.json` | Append-only history of everything published |
| `scripts/generateRefreshToken.js` | One-time local OAuth helper |
| `../.github/workflows/post-blog.yml` | Scheduled run (GitHub requires it at the repo root) |

No npm dependencies. It runs on Node's built-in `fetch`, so there is nothing to
install.

---

## Setup

### 1. Generate the OAuth refresh token

You do this once, on your own machine. It is the step that needs a browser.

First register the redirect URI. Open
[Google Cloud Console](https://console.cloud.google.com/apis/credentials), click
your OAuth 2.0 client, and add to **Authorized redirect URIs**:

```
http://localhost:3000/oauth2callback
```

Then run:

```bash
cd blogger-agent
node scripts/generateRefreshToken.js
```

It asks for the Client ID and Client Secret, opens the Google consent screen,
and prints the refresh token. Choose the Google account that **owns the blog**.

The token is also written to `blogger-agent/.env`, which is git-ignored.

The script verifies the token by reading the blog before it reports success, so
if it prints the blog name you know Blogger access works.

### 2. Add the GitHub Actions secrets

Go to your repo: **Settings -> Secrets and variables -> Actions -> New
repository secret**. Add these five:

| Secret name | Value |
|---|---|
| `GROQ_API_KEY` | your Groq key, starts `gsk_` |
| `GOOGLE_CLIENT_ID` | ends in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | starts `GOCSPX-` |
| `GOOGLE_REFRESH_TOKEN` | printed by step 1, starts `1//` |
| `BLOGGER_BLOG_ID` | `7265988019810439292` |

None of these belong in the repository. The code reads them from the
environment only.

### 3. Set the schedule

The cron lives at the top of `.github/workflows/post-blog.yml` and is currently:

```yaml
- cron: '0 6 * * *'
```

That is **06:00 UTC = 11:30 AM IST**, every day. GitHub Actions cron is always
UTC, so convert from IST by adding 5.5 hours.

| UTC | IST | Cron |
|---|---|---|
| 00:00 | 05:30 | `'0 0 * * *'` |
| 06:00 | 11:30 | `'0 6 * * *'` |
| 10:30 | 16:00 | `'30 10 * * *'` |
| 14:00 | 19:30 | `'0 14 * * *'` |
| 19:00 | 00:30 | `'0 19 * * *'` |

Format is `minute hour day-of-month month day-of-week`:

- `'0 6 * * *'` every day at 06:00 UTC
- `'0 6 * * 1-5'` Monday to Friday at 06:00 UTC
- `'30 6 * * 0'` Sundays only at 06:30 UTC

GitHub sometimes starts scheduled runs up to 15 minutes late. That is normal.

Edit the file and push. GitHub picks up the new schedule on its own.

---

## Running it

Locally, using the `.env` file from step 1:

```bash
cd blogger-agent

node src/index.js --verify    # check credentials, list recent posts
node src/index.js --dry-run   # generate a post, print it, publish nothing
node src/index.js             # generate and publish for real
```

Useful flags:

- `--verify` - confirms the tokens work and prints the 5 most recent posts
- `--dry-run` - full generation, no publish
- `--topic="some topic"` - force a specific topic instead of the rotating one

From GitHub: open the **Actions** tab, pick **Post to Blogger**, and click
**Run workflow** to trigger it without waiting for the cron.

The workflow also has a verify step that runs before the real job, so a
credential problem shows up in the log before anything is generated.

## Notes

**Model.** The agent uses `openai/gpt-oss-120b`, which is the strongest
long-form model currently available on the Groq free tier. The original
`llama-3.3-70b-versatile` has been retired by Groq. Override with the
`GROQ_MODEL` environment variable if you have access to a different one.

**Adding topics.** Drop more entries into `config/topics.json` whenever you like.
The agent picks up unused ones first and only falls back to AI-generated angles
when the list is exhausted.

**Quality control.** Nothing checks the finished post for accuracy, so skim
early runs. Especially watch for invented product claims, which the prompt
discourages but a model can still produce. Blogger keeps every post as a draft
you can edit or delete if one reads badly.
