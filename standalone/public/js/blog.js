// PinSaver blog — category filter, live search, pagination
(function () {
  const grid = document.getElementById("blog-grid");
  if (!grid) return;

  let cards = Array.from(grid.querySelectorAll(".blog-card"));
  const featured = document.querySelector(".featured-card");
  const chips = Array.from(document.querySelectorAll(".chip"));
  const searchInput = document.getElementById("blog-search");
  const countEl = document.getElementById("blog-count");
  const pageOfEl = document.getElementById("page-of");
  const statArticles = document.getElementById("stat-articles");

  const PER_PAGE = 6;
  let activeFilter = "all";
  let query = "";
  let page = 1;

  function filteredCards() {
    return cards.filter((card) => {
      const category = card.dataset.category || "all";
      const categoryOk = activeFilter === "all" || category === activeFilter;
      const text = (card.textContent || "").toLowerCase();
      const queryOk = !query || text.includes(query);
      return categoryOk && queryOk;
    });
  }

  function featuredVisible(featuredEl) {
    return !!(
      featuredEl &&
      (activeFilter === "all" || featuredEl.dataset.category === activeFilter) &&
      (!query || (featuredEl.textContent || "").toLowerCase().includes(query))
    );
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cmsCard(post) {
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
      ? `<img class="blog-img" src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" loading="lazy" style="background:linear-gradient(135deg,#fee2e2,#fecaca,#fda4af);">`
      : `<div class="blog-img" style="background:linear-gradient(135deg,#fee2e2,#fecaca,#fda4af);"></div>`;
    return `<a class="blog-card" href="/blog/${escapeHtml(post.slug)}" data-category="${escapeHtml(post.category || "tips")}">
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
        <span class="cta">Read the guide <span class="arrow">→</span></span>
      </div>
    </a>`;
  }

  async function loadCmsPosts() {
    try {
      const response = await fetch("/api/posts?status=published");
      if (!response.ok) return;
      const posts = await response.json();
      const existing = new Set(cards.map((c) => c.getAttribute("href")));
      const newCards = [];
      posts.forEach((post) => {
        const href = `/blog/${post.slug}`;
        if (existing.has(href)) return;
        const card = document.createElement("div");
        card.innerHTML = cmsCard(post).trim();
        const el = card.firstElementChild;
        if (el) {
          grid.appendChild(el);
          newCards.push(el);
          existing.add(href);
        }
      });
      if (newCards.length) {
        cards = cards.concat(newCards);
        if (statArticles) statArticles.textContent = cards.length;
        if (countEl) countEl.textContent = `${cards.length} article${cards.length === 1 ? "" : "s"} published`;
        chips.forEach((chip) => {
          const filter = chip.dataset.filter;
          const count = filter === "all"
            ? cards.length
            : cards.filter((c) => c.dataset.category === filter).length;
          const span = chip.querySelector("span");
          if (span) span.textContent = `(${count})`;
        });
        apply();
      }
    } catch (e) {
      grid.classList.remove("is-loading");
    }
  }

  loadCmsPosts();

  function apply() {
    const list = filteredCards();
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const start = (page - 1) * PER_PAGE;
    const visible = list.slice(start, start + PER_PAGE);

    cards.forEach((card) => (card.style.display = "none"));
    visible.forEach((card) => (card.style.display = "block"));

    const featuredMatch = featuredVisible(featured);
    if (featured) featured.style.display = featuredMatch ? "" : "none";

    const totalArticles = list.length + (featuredMatch ? 1 : 0);
    if (statArticles) statArticles.textContent = totalArticles;
    if (countEl) countEl.textContent = `${totalArticles} article${totalArticles === 1 ? "" : "s"} published`;

    renderPagination(totalPages, totalArticles);
  }

  function renderPagination(totalPages, totalArticles) {
    const nums = document.querySelector(".page-nums");
    const prev = document.querySelector('[data-page="prev"]');
    const next = document.querySelector('[data-page="next"]');
    const allBtns = Array.from(document.querySelectorAll(".page-btn"));

    if (totalPages <= 1) {
      if (nums) nums.innerHTML = `<span class="page-info">Page 1</span>`;
      if (prev) prev.disabled = true;
      if (next) next.disabled = true;
    } else {
      if (nums) {
        let html = "";
        for (let i = 1; i <= totalPages; i++) {
          html += `<button class="page-btn${i === page ? " active" : ""}" data-page="${i}">${i}</button>`;
        }
        nums.innerHTML = html;
      }
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = page >= totalPages;
    }

    if (pageOfEl) pageOfEl.textContent = `Page ${page} of ${totalPages} · ${totalArticles} articles total`;
    allBtns.forEach((b) => {
      if (b.dataset.page === "prev" || b.dataset.page === "next") return;
    });
    bindPageListeners();
  }

  function bindPageListeners() {
    document.querySelectorAll(".page-nums .page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        page = Number(btn.dataset.page);
        apply();
      });
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      page = 1;
      apply();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      query = searchInput.value.trim().toLowerCase();
      page = 1;
      apply();
    });
  }

  document.querySelectorAll('[data-page="prev"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (page > 1) {
        page -= 1;
        apply();
      }
    });
  });
  document.querySelectorAll('[data-page="next"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      page += 1;
      apply();
    });
  });

  apply();
})();