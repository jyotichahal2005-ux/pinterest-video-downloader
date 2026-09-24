// PinSaver downloader logic
(function () {
  const form = document.getElementById("download-form");
  const urlInput = document.getElementById("pinterest-url");
  const submitBtn = document.getElementById("download-btn");
  const btnLabel = document.getElementById("btn-label");
  const resultArea = document.getElementById("result");

  if (!form) return;

  function setStatus(type, content) {
    resultArea.innerHTML = content;
  }

  function loadingState() {
    setStatus("loading", `
      <div class="result-panel status-row">
        <div class="status-icon"><span class="spinner"></span></div>
        <div>
          <strong>Reading your pin</strong>
          <div class="text-muted" style="font-size:.85rem;margin-top:.2rem;">Finding the best available video files...</div>
        </div>
      </div>
    `);
  }

  function emptyState() {
    setStatus("empty", `
      <div class="result-panel empty-state">
        <div class="big-icon">🔗</div>
        <h3>Your download will appear here</h3>
        <p>Paste a Pinterest pin link above and we'll show the title, preview, and available video qualities.</p>
      </div>
    `);
  }

  function errorState(message) {
    setStatus("error", `
      <div class="result-panel status-row error-state">
        <div class="status-icon">✕</div>
        <div>
          <strong>That pin didn't come through</strong>
          <div class="error-msg">${escapeHtml(message)}</div>
          <button class="btn btn-primary" style="margin-top:.9rem;padding:.6rem 1rem;font-size:.85rem;" onclick="tryAnother()">Try another link</button>
        </div>
      </div>
    `);
  }

  function bestVideo(videos) {
    if (!videos || videos.length === 0) return null;
    const qualityOf = (item) => {
      const match = item && item.label ? String(item.label).match(/(\d+)/) : null;
      return match ? parseInt(match[1], 10) : 0;
    };
    return videos.reduce((best, v) => (qualityOf(v) > qualityOf(best) ? v : best), videos[0]);
  }

  function filenameFor(video) {
    return `pinterest-video-${String(video.label || "download")
      .toLowerCase()
      .replace(/\s+/g, "-")}.mp4`;
  }

  function successState(result) {
    const videos = result.videos || [];
    const best = bestVideo(videos);
    const list = videos
      .map((v, i) => {
        const filename = filenameFor(v);
        return `
        <a class="video-item" href="${v.url}" download="${filename}" onclick="return saveFileClick(this)" data-save-url="${escapeHtml(v.url)}" data-save-name="${filename}" data-testid="link-download-${i}">
          <span class="left">
            <span class="play">▶</span>
            <span class="label">${escapeHtml(v.label)}</span>
          </span>
          <span class="download-ic">⬇</span>
        </a>`;
      })
      .join("");

    const thumb = result.thumbnail
      ? `<img src="${escapeHtml(result.thumbnail)}" alt="${escapeHtml(result.title || "Pinterest video thumbnail")}">`
      : `<div class="fallback">p</div>`;

    const preview = best
      ? `<video class="thumb-video" src="${escapeHtml(best.url)}" controls playsinline preload="metadata"></video>`
      : thumb;

    const mainButton = best
      ? `<a class="btn btn-primary download-btn-primary" href="#" onclick="return saveFileClick(this)" data-save-url="${escapeHtml(best.url)}" data-save-name="${filenameFor(best)}">⬇ Download ${escapeHtml(best.label)} MP4</a>`
      : "";

    const noVideos = videos.length === 0
      ? `<div class="text-muted" style="font-size:.85rem;margin-top:1rem;">No downloadable video files were found for this pin.</div>`
      : "";

    setStatus("success", `
      <div class="result-panel" style="padding:0;overflow:hidden;">
        <div class="success-grid">
          <div class="thumb">${preview}</div>
          <div class="success-body">
            <div class="kicker">✓ PIN FOUND · READY TO SAVE</div>
            <h3>${escapeHtml(result.title || "Pinterest video")}</h3>
            <p>Direct video file, ready when you are. Press Download to save it to your device.</p>
            ${mainButton}
            ${videos.length > 1 ? `<div class="quality-label">All available qualities</div>` : ""}
            <div class="video-list">${list}</div>
            ${noVideos}
            <a class="reset-link" href="#" onclick="tryAnother();return false;">↻ Check another pin</a>
          </div>
        </div>
      </div>
    `);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function download(url) {
    if (!url.trim()) return;
    if (submitBtn) {
      submitBtn.disabled = true;
      if (btnLabel) btnLabel.textContent = "Finding video...";
    }
    loadingState();
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        errorState(data.error || "We could not read that pin. Check the link and try again.");
      } else {
        successState(data);
        resultArea.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (err) {
      errorState("Pinterest could not be reached right now. Please try again.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (btnLabel) btnLabel.textContent = "Download";
      }
    }
  }

  function tryAnother() {
    if (urlInput) urlInput.focus();
    emptyState();
  }

  function saveFile(url, filename) {
    if (!url) return;
    const params = new URLSearchParams({ url, name: filename || "pinterest-video.mp4" });
    window.location.href = "/api/file?" + params.toString();
  }

  function saveFileClick(el) {
    saveFile(el.getAttribute("data-save-url"), el.getAttribute("data-save-name"));
    return false;
  }
  // Expose for inline onclick
  window.tryAnother = tryAnother;
  window.saveFile = saveFile;
  window.saveFileClick = saveFileClick;
  window.downloadPinterest = download;

  urlInput.addEventListener("input", () => {
    if (submitBtn) submitBtn.disabled = !urlInput.value.trim();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    download(urlInput.value);
  });

  // Example chips — fill the input and start the download
  document.querySelectorAll("[data-example]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const exampleUrl = chip.dataset.example;
      if (urlInput) {
        urlInput.value = exampleUrl;
        urlInput.focus();
        if (submitBtn) submitBtn.disabled = false;
      }
      download(exampleUrl);
    });
  });

  // Paste button
  const pasteBtn = document.getElementById("paste-btn");
  if (pasteBtn) {
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text.trim();
          if (submitBtn) submitBtn.disabled = false;
          pasteBtn.textContent = "Pasted ✓";
          setTimeout(() => (pasteBtn.textContent = "Paste"), 1800);
        }
      } catch {
        pasteBtn.textContent = "Paste (denied)";
        setTimeout(() => (pasteBtn.textContent = "Paste"), 1800);
      }
    });
  }
})();
