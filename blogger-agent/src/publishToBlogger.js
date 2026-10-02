/**
 * Blogger API v3 publishing, authenticated with an OAuth2 refresh token.
 *
 * The refresh token never expires, so CI just swaps it for a short-lived
 * access token on every run before making a request.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_BASE = 'https://www.googleapis.com/blogger/v3';

export class BloggerClient {
  constructor({ clientId, clientSecret, refreshToken, blogId, blogUrl, logger }) {
    if (!clientId) throw new Error('Missing GOOGLE_CLIENT_ID.');
    if (!clientSecret) throw new Error('Missing GOOGLE_CLIENT_SECRET.');
    if (!refreshToken) throw new Error('Missing GOOGLE_REFRESH_TOKEN.');
    if (!blogId) throw new Error('Missing BLOGGER_BLOG_ID.');

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.blogId = String(blogId);
    this.blogUrl = blogUrl;
    this.log = logger || console.log.bind(console);
    this.cachedToken = null;
  }

  /** Swap the long-lived refresh token for a short-lived access token. */
  async getAccessToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.accessToken;
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const json = await readJson(res);

    if (!res.ok) {
      throw new Error(
        `OAuth refresh failed (${res.status}): ${json.error_description || json.error}. ` +
          'The refresh token is invalid or was revoked - regenerate it by re-running ' +
          'npm run token.',
      );
    }

    this.cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };

    return this.cachedToken.accessToken;
  }

  async request(endpointPath, { method = 'GET', body, label } = {}) {
    const accessToken = await this.getAccessToken();
    const url = `${BLOGGER_BASE}${endpointPath}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      throw new Error(
        `Blogger API ${label || method} failed (${res.status}): ${
          json?.error?.message || text.slice(0, 400)
        }`,
      );
    }

    return json;
  }

  /** Confirms credentials, scope and blog access before we spend a Groq call. */
  async verifyAccess() {
    const blog = await this.request(`/blogs/${this.blogId}`, { label: 'blogs.get' });
    this.log(`  connected to blog "${blog.name}" (${blog.url || this.blogUrl})`);
    return { title: blog.name, url: blog.url, id: blog.id };
  }

  /**
   * Create a published post. Blogger returns the live post URL.
   */
  async publishPost({ title, content, labels = [] }) {
    const payload = {
      kind: 'blogger#post',
      blog: { id: this.blogId },
      title,
      content: { raw: content },
      labels,
      status: 'publish',
    };

    const post = await this.request(`/blogs/${this.blogId}/posts`, {
      method: 'POST',
      body: payload,
      label: 'posts.insert',
    });

    return {
      postId: post.id,
      url: post.url,
      publishedAt: post.published || new Date().toISOString(),
      title: post.title,
    };
  }

  /** Used by --verify so you can confirm the agent is wired to the right blog. */
  async listRecentPosts(maxResults = 5) {
    const data = await this.request(
      `/blogs/${this.blogId}/posts?maxResults=${maxResults}&fields=items(id,title,url,published)`,
      { label: 'posts.list' },
    );
    return data.items || [];
  }
}

/** Absolute URL for a post, derived from the blog URL when Blogger omits it. */
export function resolvePostUrl(postUrl, blogUrl) {
  if (postUrl) return postUrl;
  if (!blogUrl) return null;
  return blogUrl.replace(/\/$/, '');
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
