const DEFAULT_SETTINGS = {
  siteTitle: "PinSaver",
  defaultMetaDescription: "",
  defaultOgImage: "",
  gaId: "",
  gscVerifyTag: "",
  instagram: "",
  twitter: "",
  youtube: "",
  facebook: "",
  supportEmail: "",
  supportPhone: "",
};

function objectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw Object.assign(new Error("Supabase storage is not configured."), { status: 503 });
  }
  try {
    new URL(url);
  } catch {
    throw Object.assign(new Error("Supabase storage is not configured."), { status: 503 });
  }
  return { url, key };
}

export function supabaseIsConfigured() {
  try {
    supabaseConfig();
    return true;
  } catch {
    return false;
  }
}

async function request(resource, { method = "GET", query, body, prefer } = {}) {
  const { url, key } = supabaseConfig();
  const target = new URL(`${url}/rest/v1/${resource}`);
  if (query) {
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        target.searchParams.set(name, String(value));
      }
    }
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  let response;
  let text;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch {
    throw Object.assign(new Error("Supabase storage is unavailable."), { status: 503 });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw Object.assign(new Error("Supabase storage request failed."), {
      status: 503,
      supabaseStatus: response.status,
    });
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Supabase storage returned invalid data."), { status: 503 });
  }
}

function postFromRow(row) {
  const payload = objectValue(row?.payload);
  const now = new Date().toISOString();
  return {
    ...payload,
    id: String(row?.id || payload.id || ""),
    slug: String(row?.slug || payload.slug || ""),
    title: String(payload.title || "Untitled Post"),
    content: String(payload.content || ""),
    excerpt: String(payload.excerpt || ""),
    category: String(payload.category || "tips"),
    author: String(payload.author || "PinSaver Team"),
    coverImage: String(payload.coverImage || ""),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    faqs: Array.isArray(payload.faqs) ? payload.faqs : [],
    metaTitle: String(payload.metaTitle || ""),
    metaDescription: String(payload.metaDescription || ""),
    readTime: String(payload.readTime || "5 min read"),
    status: row?.status === "draft" || payload.status === "draft" ? "draft" : "published",
    createdAt: row?.created_at || payload.createdAt || now,
    updatedAt: row?.updated_at || payload.updatedAt || now,
  };
}

function postToRow(post) {
  const {
    id,
    slug,
    status,
    createdAt,
    updatedAt,
    ...payload
  } = post;
  const now = new Date().toISOString();
  return {
    id: String(id),
    slug: String(slug),
    status: status === "draft" ? "draft" : "published",
    payload,
    created_at: createdAt || now,
    updated_at: updatedAt || now,
  };
}

export function normalizeSettings(value) {
  return { ...DEFAULT_SETTINGS, ...objectValue(value) };
}

export async function getBlogPosts(status) {
  const posts = [];
  let offset = 0;
  while (true) {
    const rows = await request("blog_posts", {
      query: {
        select: "id,slug,payload,status,created_at,updated_at",
        order: "created_at.asc",
        limit: 1000,
        offset,
        ...(status ? { status: `eq.${status}` } : {}),
      },
    });
    const page = Array.isArray(rows) ? rows : [];
    posts.push(...page.map(postFromRow));
    if (page.length < 1000) return posts;
    offset += page.length;
  }
}

export async function getBlogPostBySlug(slug) {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug) || null;
}

export async function createBlogPost(post) {
  const rows = await request("blog_posts", {
    method: "POST",
    query: { on_conflict: "id" },
    body: [postToRow(post)],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("Could not create the blog post."), { status: 503 });
  }
  return postFromRow(rows[0]);
}

export async function updateBlogPost(post) {
  const rows = await request("blog_posts", {
    method: "PATCH",
    query: { id: `eq.${post.id}` },
    body: postToRow(post),
    prefer: "return=representation",
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("Blog post not found."), { status: 404 });
  }
  return postFromRow(rows[0]);
}

export async function deleteBlogPost(id) {
  const rows = await request("blog_posts", {
    method: "DELETE",
    query: { id: `eq.${id}` },
    prefer: "return=representation",
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("Blog post not found."), { status: 404 });
  }
  return postFromRow(rows[0]);
}

export async function getSiteSettings() {
  const rows = await request("site_settings", {
    query: { select: "id,data,updated_at", id: "eq.default", limit: 1 },
  });
  return normalizeSettings(Array.isArray(rows) ? rows[0]?.data : null);
}

export async function upsertSiteSettings(settings) {
  const data = normalizeSettings(settings);
  const rows = await request("site_settings", {
    method: "POST",
    query: { on_conflict: "id" },
    body: [{ id: "default", data, updated_at: new Date().toISOString() }],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return normalizeSettings(Array.isArray(rows) ? rows[0]?.data : data);
}

export async function getAdminCredentials() {
  const rows = await request("admin_credentials", {
    query: { select: "id,username,password_hash,password_salt,updated_at", id: "eq.default", limit: 1 },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    username: row.username || "",
    salt: row.password_salt || "",
    hash: row.password_hash || "",
    updatedAt: row.updated_at || "",
  };
}

export async function upsertAdminCredentials(record) {
  const rows = await request("admin_credentials", {
    method: "POST",
    query: { on_conflict: "id" },
    body: [{
      id: "default",
      username: record.username || null,
      password_hash: record.hash,
      password_salt: record.salt,
      updated_at: record.updatedAt || new Date().toISOString(),
    }],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error("Could not save admin credentials."), { status: 503 });
  }
  const row = rows[0];
  return {
    username: row.username || "",
    salt: row.password_salt || "",
    hash: row.password_hash || "",
    updatedAt: row.updated_at || "",
  };
}

export { DEFAULT_SETTINGS };
