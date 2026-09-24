// PinSaver Admin CMS — add/edit blog posts
(function () {
  const form = document.getElementById("post-form");
  const idInput = document.getElementById("post-id");
  const titleInput = document.getElementById("post-title");
  const slugInput = document.getElementById("post-slug");
  const contentInput = document.getElementById("post-content");
  const excerptInput = document.getElementById("post-excerpt");
  const categoryInput = document.getElementById("post-category");
  const authorInput = document.getElementById("post-author");
  const coverUrlInput = document.getElementById("cover-url");
  const coverPreview = document.getElementById("cover-preview");
  const coverPlaceholder = document.getElementById("cover-placeholder");
  const coverImage = document.getElementById("cover-image");
  const metaTitleInput = document.getElementById("meta-title");
  const metaDescInput = document.getElementById("meta-desc");
  const metaTitleCount = document.getElementById("meta-title-count");
  const metaDescCount = document.getElementById("meta-desc-count");
  const previewToggle = document.getElementById("preview-toggle");
  const contentPreview = document.getElementById("content-preview");
  const tagsList = document.getElementById("tags-list");
  const tagsField = document.getElementById("tags-field");
  const faqList = document.getElementById("faq-list");
  const addFaqBtn = document.getElementById("add-faq-btn");
  const postPicker = document.getElementById("post-picker");
  const saveStatus = document.getElementById("save-status");
  const formTitle = document.getElementById("form-title");

  const state = {
    currentId: null,
    tags: [],
    slugTouched: false,
  };

  // ---------- Slug ----------
  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  titleInput.addEventListener("input", () => {
    if (!state.slugTouched) {
      slugInput.value = slugify(titleInput.value);
    }
  });
  slugInput.addEventListener("input", () => {
    state.slugTouched = !!slugInput.value;
  });
  slugInput.addEventListener("blur", () => {
    slugInput.value = slugify(slugInput.value);
  });

  // ---------- Cover preview ----------
  let coverTimer = null;
  coverUrlInput.addEventListener("input", () => {
    clearTimeout(coverTimer);
    coverTimer = setTimeout(updateCoverPreview, 250);
  });

  function updateCoverPreview() {
    const url = coverUrlInput.value.trim();
    if (!url) {
      coverImage.hidden = true;
      coverPlaceholder.hidden = false;
      return;
    }
    coverImage.hidden = false;
    coverPlaceholder.hidden = true;
    coverImage.src = url;
    coverImage.onerror = () => {
      coverImage.hidden = true;
      coverPlaceholder.hidden = false;
      coverPlaceholder.textContent = "Could not load image — check the URL";
    };
    coverImage.onload = () => {
      coverPlaceholder.textContent = "Image preview";
    };
  }

  // ---------- Tags ----------
  function renderTags() {
    tagsList.innerHTML = "";
    state.tags.forEach((tag, i) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.innerHTML = `<span>${escapeHtml(tag)}</span>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove tag");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        state.tags.splice(i, 1);
        renderTags();
      });
      chip.appendChild(remove);
      tagsList.appendChild(chip);
    });
  }

  function addTag(raw) {
    const tag = raw.trim().replace(/,$/, "");
    if (!tag) return;
    if (state.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    state.tags.push(tag);
    renderTags();
  }

  tagsField.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagsField.value);
      tagsField.value = "";
    }
  });
  tagsField.addEventListener("blur", () => {
    addTag(tagsField.value);
    tagsField.value = "";
  });

  // ---------- FAQ ----------
  function faqItemHtml(question, answer) {
    const wrap = document.createElement("div");
    wrap.className = "faq-pair";

    const q = document.createElement("input");
    q.type = "text";
    q.className = "admin-input";
    q.placeholder = "Question";
    q.value = question || "";
    q.setAttribute("aria-label", "FAQ question");

    const a = document.createElement("textarea");
    a.className = "admin-textarea";
    a.rows = 2;
    a.placeholder = "Answer";
    a.value = answer || "";
    a.setAttribute("aria-label", "FAQ answer");
    a.style.marginTop = ".5rem";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "faq-pair-remove";
    remove.setAttribute("aria-label", "Remove FAQ");
    remove.innerHTML = "🗑";
    remove.addEventListener("click", () => wrap.remove());

    wrap.appendChild(remove);
    wrap.appendChild(q);
    wrap.appendChild(a);
    faqList.appendChild(wrap);
  }

  addFaqBtn.addEventListener("click", () => faqItemHtml());

  function collectFaqs() {
    return Array.from(faqList.querySelectorAll(".faq-pair"))
      .map((pair) => {
        const q = pair.querySelector("input").value.trim();
        const a = pair.querySelector("textarea").value.trim();
        return q || a ? { question: q, answer: a } : null;
      })
      .filter(Boolean);
  }

  // ---------- SEO counters ----------
  function counterFor(input, countEl, limit) {
    function update() {
      const len = input.value.length;
      countEl.textContent = `${len} / ${limit}`;
      countEl.classList.toggle("over", len > limit);
      countEl.classList.toggle("warn", len > Math.round(limit * 0.9) && len <= limit);
      countEl.classList.toggle("ok", len <= Math.round(limit * 0.9));
    }
    input.addEventListener("input", update);
    update();
  }
  counterFor(metaTitleInput, metaTitleCount, 60);
  counterFor(metaDescInput, metaDescCount, 160);

  // ---------- Markdown preview ----------
  function renderMarkdown(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let listType = null;
    let inCode = false;
    let codeBuf = [];
    let inQuote = false;

    const inline = (raw) => {
      let text = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      text = text
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return text;
    };

    const flushBlock = () => {
      if (listType) { html += `</${listType}>`; listType = null; }
      if (inQuote) { html += "</blockquote>"; inQuote = false; }
    };

    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        if (inCode) {
          const codeHtml = codeBuf.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("\n");
          html += `<pre><code>${codeHtml}</code></pre>`;
          codeBuf = [];
          inCode = false;
        } else {
          flushBlock();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      const trimmed = line.trim();
      if (!trimmed) { flushBlock(); continue; }

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushBlock();
        html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
        continue;
      }

      const hr = trimmed.match(/^([-*_])[ \t]*\1[ \t]*\1+$/);
      if (hr) { flushBlock(); html += "<hr>"; continue; }

      const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
      if (unordered) {
        if (listType !== "ul") { flushBlock(); listType = "ul"; html += "<ul>"; }
        html += `<li>${inline(unordered[1])}</li>`;
        continue;
      }

      const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (ordered) {
        if (listType !== "ol") { flushBlock(); listType = "ol"; html += "<ol>"; }
        html += `<li>${inline(ordered[1])}</li>`;
        continue;
      }

      const quote = trimmed.match(/^>\s?(.*)$/);
      if (quote) {
        if (!inQuote) { flushBlock(); inQuote = true; html += "<blockquote>"; }
        html += `<p>${inline(quote[1])}</p>`;
        continue;
      }

      flushBlock();
      html += `<p>${inline(trimmed)}</p>`;
    }
    flushBlock();
    if (inCode) {
      const codeHtml = codeBuf.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("\n");
      html += `<pre><code>${codeHtml}</code></pre>`;
    }
    return html;
  }

  previewToggle.addEventListener("click", () => {
    const visible = contentPreview.hidden;
    contentPreview.hidden = !visible;
    if (visible) {
      contentPreview.innerHTML = renderMarkdown(contentInput.value);
      previewToggle.textContent = "Hide preview";
    } else {
      previewToggle.textContent = "Live preview";
    }
  });

  // ---------- Helpers ----------
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(message, cls) {
    saveStatus.textContent = message || "";
    saveStatus.className = "admin-status " + (cls || "idle");
  }

  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Auth gate (optional password protection) ----------
  const authGate = document.getElementById("auth-gate");
  const authUser = document.getElementById("auth-user");
  const authPass = document.getElementById("auth-pass");
  const authBtn = document.getElementById("auth-btn");
  const authStatusEl = document.getElementById("auth-status");

  function showAuthGate(message) {
    if (!authGate) return;
    authGate.hidden = false;
    if (authStatusEl) {
      authStatusEl.textContent = message || "";
      authStatusEl.className = "admin-status " + (message ? "error" : "idle");
    }
    if (authUser) authUser.focus();
    else if (authPass) authPass.focus();
  }

  async function doAdminLogin() {
    if (!authStatusEl) return;
    authStatusEl.textContent = "Checking...";
    authStatusEl.className = "admin-status idle";
    try {
      const res = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: (authUser ? authUser.value : "").trim(),
          password: authPass.value,
        }),
      });
      if (res.ok) {
        authGate.hidden = true;
        if (authUser) authUser.value = "";
        authPass.value = "";
        await loadPicker();
      }
    } catch (e) {
      authStatusEl.textContent = e.message;
      authStatusEl.className = "admin-status error";
      authPass.focus();
    }
  }

  if (authBtn) authBtn.addEventListener("click", doAdminLogin);
  if (authUser) authUser.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && authPass) authPass.focus();
  });
  if (authPass) authPass.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAdminLogin();
  });

  // ---------- AI Assistant ----------
  const aiBadge = document.getElementById("ai-badge");
  const aiButtons = Array.from(document.querySelectorAll("[data-ai]"));

  const AI_ACTION_LABELS = {
    outline: "AI outline",
    content: "AI article",
    improve: "AI improve",
    tags: "AI tags",
    faqs: "AI FAQs",
    excerpt: "AI excerpt",
    seo: "AI SEO",
  };

  function updateAiUi() {
    if (!aiBadge) return;
    const ai = state.ai;
    if (!ai) return;
    if (ai.configured) {
      aiBadge.className = "ai-badge is-ready";
      aiBadge.textContent = `AI ready \u00b7 ${ai.provider} \u00b7 ${ai.model}`;
      aiBadge.title = "AI Assistant chal raha hai. Change key in standalone/.env.";
    } else {
      aiBadge.className = "ai-badge is-off";
      aiBadge.textContent = "AI setup needed";
      aiBadge.title = "AI used kaam karne ke liye standalone/.env me AI_API_KEY daalo. Free Gemini key: aistudio.google.com/apikey";
    }
    aiBadge.hidden = false;
  }

  function parseAiJson(text) {
    const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : String(text || "");
    const start = candidate.indexOf("{");
    const arrStart = candidate.indexOf("[");
    let begin = 0;
    if (start === -1 && arrStart === -1) return null;
    begin = arrStart === -1 ? start : start === -1 ? arrStart : Math.min(start, arrStart);
    try {
      return JSON.parse(candidate.slice(begin).trim());
    } catch {
      return null;
    }
  }

  function applyAiResult(action, result) {
    const text = String(result || "").trim();
    switch (action) {
      case "outline":
      case "content":
      case "improve":
        if (contentInput.value.trim() && contentInput.value.trim() !== text) {
          if (!window.confirm("Content box me pehle se text hai. AI output se replace karein?")) return;
        }
        contentInput.value = text;
        contentPreview.hidden = true;
        previewToggle.textContent = "Live preview";
        return;
      case "excerpt":
        excerptInput.value = text;
        return;
      case "tags": {
        const parsed = parseAiJson(text);
        const items =
          Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.tags)) ? parsed.tags : [];
        items.slice(0, 12).forEach((t) => addTag(String(t)));
        return;
      }
      case "faqs": {
        const parsed = parseAiJson(text);
        const items =
          Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.faqs)) ? parsed.faqs : [];
        faqList.innerHTML = "";
        items
          .filter((f) => f && (f.question || f.answer))
          .forEach((f) => faqItemHtml(f.question, f.answer));
        return;
      }
      case "seo": {
        const parsed = parseAiJson(text);
        if (!parsed) {
          metaTitleInput.value = text.slice(0, 200);
        } else {
          if (parsed.metaTitle) metaTitleInput.value = String(parsed.metaTitle).slice(0, 200);
          if (parsed.metaDescription) metaDescInput.value = String(parsed.metaDescription).slice(0, 320);
        }
        metaTitleCount.textContent = `${metaTitleInput.value.length} / 60`;
        metaDescCount.textContent = `${metaDescInput.value.length} / 160`;
        return;
      }
    }
  }

  async function runAiAction(action) {
    if (!state.ai?.configured) {
      setStatus(
        "AI setup nahi hai. standalone/.env me AI_API_KEY daal do \u2014 free Gemini key: aistudio.google.com/apikey",
        "error"
      );
      return;
    }
    const title = titleInput.value.trim();
    if (action !== "improve" && action !== "seo" && !title) {
      setStatus("Pehle blog ka title likh do \u2014 AI usi ke basis par kaam karega.", "error");
      titleInput.focus();
      return;
    }
    const notes = contentInput.value.trim() || excerptInput.value.trim() || "";
    const btn = document.querySelector(`[data-ai="${action}"]`);
    if (btn) btn.classList.add("admin-btn-loading");
    setStatus((AI_ACTION_LABELS[action] || action) + "... AI chal raha hai \u2014 thodi der ruko", "idle");
    try {
      const data = await api("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          action,
          title,
          category: categoryInput.value,
          keywords: title,
          notes: notes || undefined,
        }),
      });
      applyAiResult(action, data.result);
      setStatus((AI_ACTION_LABELS[action] || action) + " ho gaya \u2713", "ok");
    } catch (e) {
      setStatus(e.message, "error");
    } finally {
      if (btn) btn.classList.remove("admin-btn-loading");
    }
  }

  aiButtons.forEach((b) =>
    b.addEventListener("click", () => runAiAction(b.dataset.ai))
  );

  async function initAdmin() {
    state.ai = null;
    try {
      state.ai = await api("/api/ai/status");
    } catch {
      state.ai = null;
    }
    updateAiUi();
    if (state.ai?.adminAuth) {
      try {
        await loadPicker();
      } catch (e) {
        if (e.status === 401) showAuthGate();
        else setStatus(e.message, "error");
      }
    } else {
      loadPicker();
    }
  }

  // ---------- Form fill / load ----------
  function fillForm(post) {
    state.currentId = post.id;
    state.tags = Array.isArray(post.tags) ? post.tags.slice() : [];
    state.slugTouched = true;
    idInput.value = post.id;
    titleInput.value = post.title || "";
    slugInput.value = post.slug || "";
    contentInput.value = post.content || "";
    excerptInput.value = post.excerpt || "";
    categoryInput.value = post.category || "tips";
    authorInput.value = post.author || "PinSaver Team";
    coverUrlInput.value = post.coverImage || "";
    metaTitleInput.value = post.metaTitle || "";
    metaDescInput.value = post.metaDescription || "";
    formTitle.textContent = `Edit: ${post.title || "Untitled"}`;
    renderTags();
    updateCoverPreview();
    metaTitleCount.textContent = `${metaTitleInput.value.length} / 60`;
    metaDescCount.textContent = `${metaDescInput.value.length} / 160`;
    counterFor(metaTitleInput, metaTitleCount, 60);
    counterFor(metaDescInput, metaDescCount, 160);
    faqList.innerHTML = "";
    (post.faqs || []).forEach((f) => faqItemHtml(f.question, f.answer));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    state.currentId = null;
    state.tags = [];
    state.slugTouched = false;
    idInput.value = "";
    form.reset();
    formTitle.textContent = "Create New Post";
    renderTags();
    coverImage.hidden = true;
    coverPlaceholder.hidden = false;
    coverUrlInput.value = "";
    faqList.innerHTML = "";
    contentPreview.hidden = true;
    previewToggle.textContent = "Live preview";
    setStatus("", "idle");
  }

  // ---------- Navigation (Dashboard / Blog / Settings) ----------
  const viewDashboard = document.getElementById("view-dashboard");
  const viewBlog = document.getElementById("view-blog");
  const viewSettings = document.getElementById("view-settings");
  const navLinks = document.querySelectorAll(".side-link");
  const dashNew = document.getElementById("dash-new");
  const dashSearch = document.getElementById("dash-search");
  const dashBlogList = document.getElementById("dash-blog-list");
  const statTotal = document.getElementById("stat-total");
  const statPublished = document.getElementById("stat-published");
  const statDraft = document.getElementById("stat-draft");
  const statCards = document.querySelectorAll(".stat-card");
  const dashListTitle = document.getElementById("dash-list-title");
  const dashListSub = document.getElementById("dash-list-sub");

  state.viewFilter = "all";
  state.searchQuery = "";
  state.allPosts = [];

  function switchView(name) {
    const showDashboard = name === "dashboard";
    viewDashboard.classList.toggle("is-hidden", !showDashboard);
    viewBlog.classList.toggle("is-hidden", showDashboard || name === "settings");
    if (viewSettings) viewSettings.classList.toggle("is-hidden", name !== "settings");
    navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.nav === name));
  }

  navLinks.forEach((l) =>
    l.addEventListener("click", () => switchView(l.dataset.nav))
  );

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try { await api("/api/admin/logout", { method: "POST" }); } catch {}
      location.reload();
    });
  }

  dashNew.addEventListener("click", () => {
    postPicker.value = "";
    resetForm();
    switchView("blog");
  });

  const blogBackBtn = document.getElementById("blog-back-btn");
  if (blogBackBtn) {
    blogBackBtn.addEventListener("click", () => switchView("dashboard"));
  }

  statCards.forEach((card) =>
    card.addEventListener("click", () => {
      state.viewFilter = card.dataset.stat;
      renderDashboard();
    })
  );

  dashSearch.addEventListener("input", () => {
    state.searchQuery = dashSearch.value.trim().toLowerCase();
    renderDashboard();
  });

  function formatShortDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  }

  function renderDashboard() {
    if (!dashBlogList) return;
    const published = state.allPosts.filter((p) => p.status !== "draft").length;
    const drafts = state.allPosts.length - published;
    if (statTotal) statTotal.textContent = state.allPosts.length;
    if (statPublished) statPublished.textContent = published;
    if (statDraft) statDraft.textContent = drafts;
    statCards.forEach((card) =>
      card.classList.toggle("is-active", card.dataset.stat === state.viewFilter));

    let list = state.allPosts.slice();
    if (state.viewFilter === "published") list = list.filter((p) => p.status !== "draft");
    else if (state.viewFilter === "draft") list = list.filter((p) => p.status === "draft");

    if (state.searchQuery) {
      const q = state.searchQuery;
      list = list.filter((p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.excerpt || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    const filterLabel = {
      all: "All Blogs",
      published: "Published Blogs",
      draft: "Draft Blogs",
    }[state.viewFilter];
    dashListTitle.textContent = filterLabel;
    dashListSub.textContent = `${list.length} blog${list.length === 1 ? "" : "s"} mila${
      state.searchQuery ? ` — search: "${state.searchQuery}"` : ""
    }`;

    if (!list.length) {
      dashBlogList.innerHTML = `<div class="dash-empty">Koi blog nahi mila. Upar "+ New Blog" dabake pehla blog banao.</div>`;
      return;
    }

    dashBlogList.innerHTML = list
      .map((p) => {
        const isDraft = p.status === "draft";
        const statusLabel = isDraft ? "Draft" : "Published";
        const statusClass = isDraft ? "status-draft" : "status-published";
        return `<article class="dash-item" data-id="${escapeHtml(p.id)}">
          <div class="dash-item-info">
            <h3 class="dash-item-title">${escapeHtml(p.title || "Untitled Post")}</h3>
            <div class="dash-item-meta">
              <span class="status-badge ${statusClass}">${statusLabel}</span>
              <span class="dash-item-date">Updated ${formatShortDate(p.updatedAt)}</span>
            </div>
          </div>
          <div class="dash-item-actions">
            <button type="button" class="admin-btn admin-btn-outline admin-btn-sm" data-act="edit">Edit</button>
            <button type="button" class="admin-btn ${isDraft ? "admin-btn-accent" : "admin-btn-outline"} admin-btn-sm" data-act="toggle">${isDraft ? "Publish" : "Unpublish"}</button>
            <button type="button" class="admin-btn admin-btn-outline admin-btn-sm dash-btn-del" data-act="delete">Delete</button>
          </div>
        </article>`;
      })
      .join("");

    dashBlogList.querySelectorAll(".dash-item").forEach((item) => {
      const id = item.dataset.id;
      item.querySelector("[data-act='edit']").addEventListener("click", () => goEditPost(id));
      item.querySelector("[data-act='toggle']").addEventListener("click", () => togglePostStatus(id));
      item.querySelector("[data-act='delete']").addEventListener("click", () => deletePost(id));
    });
  }

  function goEditPost(id) {
    postPicker.value = id;
    loadPost(id).then(() => switchView("blog"));
  }

  function togglePostStatus(id) {
    setStatus("Updating...", "idle");
    api(`/api/posts/${id}`)
      .then((post) => {
        const next = post.status === "draft" ? "published" : "draft";
        return api(`/api/posts/${id}`, {
          method: "PUT",
          body: JSON.stringify({ status: next }),
        });
      })
      .then((saved) => {
        setStatus(saved.status === "draft" ? "Draft me bheja gaya ✓" : "Published ✓", "ok");
        return loadPosts();
      })
      .catch((err) => setStatus(err.message, "error"));
  }

  function deletePost(id) {
    api(`/api/posts/${id}`)
      .then((post) => {
        const name = post.title || "this post";
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return null;
        return api(`/api/posts/${id}`, { method: "DELETE" });
      })
      .then((deleted) => {
        if (!deleted) return;
        setStatus("Post deleted ✓", "ok");
        return loadPosts();
      })
      .catch((err) => setStatus(err.message, "error"));
  }

  async function loadPosts() {
    try {
      const posts = await api("/api/posts");
      state.allPosts = posts;
      posts.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      postPicker.innerHTML = '<option value="">— Select a post —</option>';
      posts.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const statusBadge = p.status === "draft" ? " (draft)" : "";
        opt.textContent = `${p.title}${statusBadge}`;
        postPicker.appendChild(opt);
      });
      renderDashboard();
      const editId = new URLSearchParams(window.location.search).get("edit");
      if (editId && posts.some((p) => p.id === editId)) {
        postPicker.value = editId;
        await loadPost(editId);
      }
    } catch (e) {
      setStatus(e.message, "error");
    }
  }

  // ---------- Post picker ----------
  async function loadPicker() {
    await loadPosts();
  }

  async function loadPost(id) {
    try {
      setStatus("Loading post...", "idle");
      const post = await api(`/api/posts/${id}`);
      fillForm(post);
      setStatus("", "idle");
    } catch (e) {
      setStatus(e.message, "error");
    }
  }

  postPicker.addEventListener("change", () => {
    const id = postPicker.value;
    if (id) loadPost(id);
  });

  // ---------- Collect form payload ----------
  function collectPayload() {
    return {
      title: titleInput.value.trim(),
      slug: slugify(slugInput.value) || slugify(titleInput.value),
      content: contentInput.value,
      excerpt: excerptInput.value.trim(),
      category: categoryInput.value,
      author: authorInput.value.trim() || "PinSaver Team",
      coverImage: coverUrlInput.value.trim(),
      tags: state.tags.slice(),
      faqs: collectFaqs(),
      metaTitle: metaTitleInput.value.trim(),
      metaDescription: metaDescInput.value.trim(),
    };
  }

  // ---------- Save ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!titleInput.value.trim()) {
      setStatus("Please add a title first.", "error");
      titleInput.focus();
      return;
    }
    const action = e.submitter ? e.submitter.value : "draft";
    const payload = collectPayload();
    payload.status = action === "draft" ? "draft" : "published";

    const isEditing = !!state.currentId;
    const submitter = e.submitter;
    if (submitter) submitter.classList.add("admin-btn-loading");
    try {
      let saved;
      if (isEditing) {
        saved = await api(`/api/posts/${state.currentId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await api("/api/posts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      fillForm(saved);
      setStatus(
        action === "draft" ? "Draft saved ✓" : "Published ✓",
        "ok"
      );
      await loadPickerSilent(saved.id);
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      if (submitter) submitter.classList.remove("admin-btn-loading");
    }
  });

  async function loadPickerSilent(selectedId) {
    try {
      const posts = await api("/api/posts");
      state.allPosts = posts;
      posts.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      postPicker.innerHTML = '<option value="">— Select a post —</option>';
      posts.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const statusBadge = p.status === "draft" ? " (draft)" : "";
        opt.textContent = `${p.title}${statusBadge}`;
        postPicker.appendChild(opt);
      });
      if (selectedId) postPicker.value = selectedId;
      renderDashboard();
    } catch (e) {
      /* keep picker as-is */
    }
  }

  // ---------- Settings: load + save ----------
  const SETTINGS_MAP = {
    seo: [
      ["set-site-title", "siteTitle"],
      ["set-meta-desc", "defaultMetaDescription"],
      ["set-og-image", "defaultOgImage"],
    ],
    analytics: [
      ["set-ga-id", "gaId"],
      ["set-gsc-tag", "gscVerifyTag"],
    ],
    social: [
      ["set-instagram", "instagram"],
      ["set-twitter", "twitter"],
      ["set-youtube", "youtube"],
      ["set-facebook", "facebook"],
    ],
    contact: [
      ["set-support-email", "supportEmail"],
      ["set-support-phone", "supportPhone"],
    ],
  };

  function setSettingStatus(id, message, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = "admin-status" + (isError ? " error" : "");
  }

  async function loadSettingsFields() {
    try {
      const s = await api("/api/admin/settings");
      for (const section of Object.values(SETTINGS_MAP)) {
        for (const [fieldId, key] of section) {
          const el = document.getElementById(fieldId);
          if (el) el.value = s[key] || "";
        }
      }
    } catch (e) {
      if (e.status === 401) showAuthGate();
    }
  }

  function wireSettings() {
    document.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const section = btn.dataset.save;
        const statusId = "status-" + section;
        setSettingStatus(statusId, "Saving…", false);
        const payload = {};
        for (const [fieldId, key] of SETTINGS_MAP[section]) {
          const el = document.getElementById(fieldId);
          if (el) payload[key] = (el.value || "").trim();
        }
        try {
          await api("/api/admin/settings", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setSettingStatus(statusId, "Saved — site ke head/footer me live update ho gaya.");
        } catch (e) {
          setSettingStatus(statusId, e.message, true);
        }
      });
    });

    const pwBtn = document.getElementById("btn-change-password");
    if (pwBtn) {
      pwBtn.addEventListener("click", async function () {
        const cur = document.getElementById("pw-current");
        const nw = document.getElementById("pw-new");
        const cf = document.getElementById("pw-confirm");
        if (!cur.value || !nw.value || !cf.value) {
          setSettingStatus("status-password", "Teeno fields bharo.", true);
          return;
        }
        setSettingStatus("status-password", "Changing…", false);
        try {
          await api("/api/admin/change-password", {
            method: "POST",
            body: JSON.stringify({
              currentPassword: cur.value,
              newPassword: nw.value,
              confirmPassword: cf.value,
            }),
          });
          setSettingStatus("status-password", "Password update ho gaya — agle login me naya password use karo.");
          cur.value = "";
          nw.value = "";
          cf.value = "";
        } catch (e) {
          setSettingStatus("status-password", e.message, true);
        }
      });
    }
  }

  // ---------- Init ----------
  renderTags();
  initAdmin();
  loadSettingsFields();
  wireSettings();
  if (window.adminReset) window.adminReset = resetForm;
  window.resetForm = resetForm;
})();