import { extractFirstHttpUrl } from "/v2-url.js";

const inputEl = document.getElementById("videoUrl");
const runBtn = document.getElementById("runBtn");
const errorBox = document.getElementById("errorBox");
const resultBox = document.getElementById("resultBox");

function setBusy(busy) {
  runBtn.disabled = busy;
  runBtn.textContent = busy ? "\u89e3\u6790\u4e2d..." : "\u5f00\u59cb\u89e3\u6790";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>\"]/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return map[char] || char;
  });
}

function showError(message) {
  errorBox.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

function clearError() {
  errorBox.innerHTML = "";
}

function clearResult() {
  resultBox.innerHTML = "";
}

function normalizeInput(raw) {
  const directUrl = String(raw || "").trim();
  if (!directUrl) {
    return "";
  }
  return extractFirstHttpUrl(directUrl) || directUrl;
}

function renderResult(data) {
  const platform = escapeHtml(data.platform || "\u672a\u77e5");
  const title = escapeHtml(data.title || "\u672a\u547d\u540d\u89c6\u9891");
  const shareUrl = escapeHtml(data.originalUrl || "");
  const playPath = escapeHtml(data.playPath || "");
  const downloadPath = escapeHtml(data.downloadPath || "");

  resultBox.innerHTML = `
    <section class="result">
      <p class="meta"><strong>\u6765\u6e90\u5e73\u53f0\uff1a</strong>${platform}</p>
      <p class="meta"><strong>\u89c6\u9891\u6807\u9898\uff1a</strong>${title}</p>
      <a class="url" href="${shareUrl}" target="_blank" rel="noreferrer">\u539f\u59cb\u5206\u4eab\u94fe\u63a5</a>
      <video controls preload="metadata" playsinline src="${playPath}"></video>
      <a class="download" href="${downloadPath}">\u4e0b\u8f7d\u8fd9\u4e2a\u89c6\u9891</a>
    </section>
  `;
}

async function parseVideo() {
  clearError();
  clearResult();

  const normalizedUrl = normalizeInput(inputEl.value);
  if (!normalizedUrl) {
    showError("\u5148\u7c98\u8d34\u4e00\u4e2a\u89c6\u9891\u94fe\u63a5\u518d\u89e3\u6790\u3002");
    return;
  }

  inputEl.value = normalizedUrl;
  setBusy(true);

  try {
    const response = await fetch("/api/v2/remove-watermark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalizedUrl }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      throw new Error("\u670d\u52a1\u8fd4\u56de\u7684\u5185\u5bb9\u770b\u4e0d\u61c2\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002");
    }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || "\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u6362\u4e00\u6761\u94fe\u63a5\u518d\u8bd5\u3002");
    }

    renderResult(payload.data || {});
  } catch (error) {
    showError(error.message || "\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002");
  } finally {
    setBusy(false);
  }
}

runBtn.addEventListener("click", parseVideo);

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    parseVideo();
  }
});
