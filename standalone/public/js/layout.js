// PinSaver v2 — Enhanced layout with staggered animations
const NAV_ITEMS = [
  ["Home", "/", "home"],
  ["About", "/about", "about"],
  ["How It Works", "/how-it-works", "how-it-works"],
  ["Blog", "/blog", "blog"],
];

function currentKey() {
  const p = window.location.pathname.replace(/\/+$/, "");
  if (p === "" || p === "/") return "home";
  if (p === "/blog" || p.startsWith("/blog/")) return "blog";
  return p.replace(/^\//, "").replace(".html", "");
}

function renderHeader(container) {
  const current = currentKey();
  const links = NAV_ITEMS.map(([label, href, key]) => {
    const active = key === current ? " active" : "";
    return `<a class="${'nav-link' + active}" href="${href}" data-key="${key}">${label}</a>`;
  }).join("");

  container.innerHTML = `
    <header class="site-header">
      <div class="wrap nav-row">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">p</span>
          <span>Pin<span class="gradient-text">Saver</span></span>
        </a>
        <nav class="nav-links" aria-label="Main navigation">${links}</nav>
        <button class="nav-toggle" aria-label="Toggle menu" data-nav-toggle>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
      <nav class="mobile-menu" data-mobile-menu>${links}</nav>
    </header>`;

  const toggle = container.querySelector("[data-nav-toggle]");
  const menu = container.querySelector("[data-mobile-menu]");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      menu.classList.toggle("open");
      const isOpen = menu.classList.contains("open");
      toggle.innerHTML = isOpen
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    });
  }
}

function initFaq() {
  document.querySelectorAll(".faq-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const wasOpen = item.classList.contains("open");
      // Close all others
      document.querySelectorAll(".faq-item.open").forEach(i => i.classList.remove("open"));
      if (!wasOpen) item.classList.add("open");
    });
  });
}

function renderFooter(container) {
  container.innerHTML = `
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-brand">
            <a class="brand" href="/">
              <span class="brand-mark" aria-hidden="true">p</span>
              <span>Pin<span class="gradient-text">Saver</span></span>
            </a>
            <p>Save Pinterest videos in original quality — fast, free, no app needed.</p>
            <div class="footer-social" hidden></div>
          </div>
          <div class="footer-col">
            <h4>Quick Links</h4>
            <div class="footer-col-links">
              <a href="/">Home</a>
              <a href="/blog">Blog</a>
              <a href="/faq">FAQ</a>
              <a href="/contact">Contact</a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Works Great On</h4>
            <div class="footer-col-links">
              <a href="/pinterest-video-downloader-for-iphone">iPhone</a>
              <a href="/pinterest-video-downloader-for-android">Android</a>
              <a href="/pinterest-video-downloader-for-pc">PC / Windows</a>
              <a href="/pinterest-video-downloader-for-mac">Mac</a>
            </div>
          </div>
          <div class="footer-col">
            <h4>Legal</h4>
            <div class="footer-col-links">
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/disclaimer">Disclaimer</a>
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; 2026 PinSaver. All rights reserved.</span>
          <a href="/admin" style="font-size:.78rem;color:var(--muted-2);text-decoration:underline;">Admin</a>
        </div>
        <div class="footer-contact" hidden></div>
      </div>
    </footer>`;
}

function initLayout() {
  const headerRoot = document.querySelector("[data-header]");
  const footerRoot = document.querySelector("[data-footer]");
  if (headerRoot) renderHeader(headerRoot);
  if (footerRoot) renderFooter(footerRoot);
  loadSiteSettings();
  initAdminBackBar();
}

function initAdminBackBar() {
  let from = null;
  try {
    from = new URLSearchParams(window.location.search).get("from");
  } catch (e) {}
  if (from !== "admin") return;
  const style = document.createElement("style");
  style.textContent =
    ".admin-back-bar{position:sticky;top:0;z-index:999;display:flex;align-items:center;justify-content:center;gap:.5rem;background:linear-gradient(135deg,#a01717,#e04545);color:#fff;font-size:.82rem;font-weight:700;padding:.55rem 1rem;text-align:center}.admin-back-bar a{color:#fff;background:#fff;color:#a01717;font-size:.8rem;font-weight:800;padding:.3rem .8rem;border-radius:999px;text-decoration:none;margin-left:.4rem;white-space:nowrap}.admin-back-bar a:hover{background:#ffe4e6}";
  document.head.appendChild(style);
  const bar = document.createElement("div");
  bar.className = "admin-back-bar";
  bar.innerHTML = "You are previewing your site as admin <a href='/admin'>← Back to Admin panel</a>";
  document.body.insertBefore(bar, document.body.firstChild);
}

const SOCIAL_ICONS = [
  ["instagram", "Instagram", '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0 1.802c-3.14 0-3.517.015-4.759.074-2.88.13-3.462 1.178-3.462 4.39 0 3.062.826 4.783 5.024 4.783 3.187 0 4.695-1.741 4.695-4.783 0-3.061-.826-4.3-5.024-4.3zm0 2.874a2.699 2.699 0 110 5.397 2.699 2.699 0 010-5.397zm5.417-2.903a.63.63 0 110 1.259.63.63 0 010-1.259z"/></svg>'],
  ["twitter", "Twitter / X", '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'],
  ["youtube", "YouTube", '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'],
  ["facebook", "Facebook", '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'],
];

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadSiteSettings() {
  try {
    const response = await fetch("/api/site/settings", { credentials: "same-origin" });
    if (!response.ok) return;
    const s = await response.json();

    const socialEl = document.querySelector(".footer-social");
    if (socialEl) {
      const links = SOCIAL_ICONS
        .filter(([key]) => s[key])
        .map(([key, label, svg]) =>
          `<a class="footer-social-link" href="${escapeAttr(s[key])}" target="_blank" rel="noopener nofollow" aria-label="${escapeAttr(label)}">${svg}</a>`
        );
      if (links.length) {
        socialEl.hidden = false;
        socialEl.innerHTML = `<h4>Connect With Us</h4><div class="footer-social-links">${links.join("")}</div>`;
      }
    }

    const contactEl = document.querySelector(".footer-contact");
    if (contactEl) {
      const bits = [];
      if (s.supportEmail) bits.push(`<a href="mailto:${escapeAttr(s.supportEmail)}">&#9993; ${escapeAttr(s.supportEmail)}</a>`);
      if (s.supportPhone) bits.push(`<a href="tel:${escapeAttr(s.supportPhone)}">&#9742; ${escapeAttr(s.supportPhone)}</a>`);
      if (bits.length) {
        contactEl.hidden = false;
        contactEl.innerHTML = `<div class="footer-contact-links">${bits.join("")}</div>`;
      }
    }
  } catch {
    /* footer stays clean if settings unavailable */
  }
}

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || els.length === 0) {
    els.forEach((el) => el.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Add stagger delay based on index within parent
          const siblings = Array.from(entry.target.parentElement.querySelectorAll('.reveal'));
          const index = siblings.indexOf(entry.target);
          const delay = Math.min(index * 100, 500);
          setTimeout(() => {
            entry.target.classList.add("revealed");
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.06, rootMargin: "0px 0px -40px 0px" }
  );

  els.forEach((el) => observer.observe(el));
}

// Smooth scroll for anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// Page transition: intercept internal navigation and slide the page down.
// On click, animate the current page downward, then navigate.
function initPageTransition() {
  const isSamePage = (href) =>
    href && !href.startsWith("http") && !href.startsWith("mailto") &&
    !href.startsWith("tel:") && href[0] !== "#";

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute("href");
    if (!isSamePage(href)) return;

    // Skip if modifier key held or target is _blank / different window
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.hasAttribute("target")) return;

    event.preventDefault();

    document.body.classList.add("page-exit-down");
    window.scrollTo(0, 0);

    const resolved = new URL(href, window.location.origin).pathname;
    setTimeout(() => {
      window.location.href = resolved || href;
    }, 280);
  });
}

// Entrance animation: slide the new page down into place on load.
function initPageEnter() {
  window.scrollTo(0, 0);
  document.body.classList.add("page-enter-down");
  window.setTimeout(() => {
    document.body.classList.remove("page-enter-down");
  }, 500);
}

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
  initFaq();
  initReveal();
  initSmoothScroll();
  initPageTransition();
  initPageEnter();
});
