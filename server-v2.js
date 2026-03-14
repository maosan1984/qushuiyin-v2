import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filename) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.v2");

const PORT = Number(process.env.V2_PORT || 3002);
const API_URL = "https://api.wxshares.com/api/qsy/plus";
const API_KEY = process.env.API_KEY || "";

const PUBLIC_DIR = path.join(__dirname, "public");
const mediaCache = new Map();
const MEDIA_TTL_MS = 30 * 60 * 1000;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendFile(res, filename, contentType) {
  const fullPath = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.end(fs.readFileSync(fullPath));
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "";
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString();
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function callUpstream(videoUrl) {
  if (!API_KEY) {
    return {
      success: false,
      message: "API_KEY is not configured on the server.",
    };
  }

  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: videoUrl,
      key: API_KEY,
    }),
  });

  let data;
  try {
    data = await upstream.json();
  } catch {
    return {
      success: false,
      message: "Upstream returned non-JSON content.",
    };
  }

  if (!upstream.ok || data.code !== 200) {
    return {
      success: false,
      message: `Upstream parse failed (code ${data?.code ?? "unknown"}).`,
    };
  }

  const outputUrl = data?.data?.play || data?.data?.url;
  if (!outputUrl) {
    return {
      success: false,
      message: "Upstream response missing output URL.",
    };
  }

  return {
    success: true,
    data: {
      originalUrl: videoUrl,
      noWatermarkUrl: outputUrl,
      platform: data?.data?.platform || "Unknown",
      title: data?.data?.title || "Untitled",
    },
  };
}

function issueMediaToken(mediaUrl) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  mediaCache.set(token, {
    mediaUrl,
    expiresAt: Date.now() + MEDIA_TTL_MS,
  });
  return token;
}

function consumeMediaToken(token) {
  const item = mediaCache.get(token);
  if (!item) {
    return "";
  }
  if (Date.now() > item.expiresAt) {
    mediaCache.delete(token);
    return "";
  }
  return item.mediaUrl;
}

function cleanupExpiredMediaTokens() {
  const now = Date.now();
  for (const [token, item] of mediaCache.entries()) {
    if (now > item.expiresAt) {
      mediaCache.delete(token);
    }
  }
}

async function proxyMedia(req, res, mediaUrl, forceDownload) {
  let parsed;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    sendJson(res, 400, { success: false, message: "Invalid media url." });
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    sendJson(res, 400, { success: false, message: "Unsupported media protocol." });
    return;
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
  };
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }
  const clientIp = getClientIp(req);
  if (clientIp) {
    headers["X-Forwarded-For"] = clientIp;
    headers["X-Real-IP"] = clientIp;
  }

  let upstream;
  try {
    upstream = await fetch(mediaUrl, { headers });
  } catch (error) {
    console.error("media proxy fetch failed:", error);
    sendJson(res, 502, { success: false, message: "Media fetch failed." });
    return;
  }

  const status = upstream.status;
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/octet-stream"
  );

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    res.setHeader("Content-Length", contentLength);
  }
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) {
    res.setHeader("Accept-Ranges", acceptRanges);
  }
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) {
    res.setHeader("Content-Range", contentRange);
  }

  if (forceDownload) {
    res.setHeader("Content-Disposition", 'attachment; filename="video.mp4"');
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  // Stream upstream bytes to client to bypass hotlink restrictions in browser.
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    res.write(Buffer.from(value));
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    if (req.url === "/" || req.url === "/v2.html") {
      sendFile(res, "v2.html", "text/html; charset=utf-8");
      return;
    }
    if (req.url === "/v2.js") {
      sendFile(res, "v2.js", "application/javascript; charset=utf-8");
      return;
    }
    if (req.url === "/v2-url.js") {
      sendFile(res, "v2-url.js", "application/javascript; charset=utf-8");
      return;
    }
    if (req.url && req.url.startsWith("/api/v2/media")) {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const pathParts = reqUrl.pathname.split("/").filter(Boolean);
      const token = pathParts.length >= 4 ? pathParts[3] : "";
      const mediaUrl = token ? consumeMediaToken(token) : reqUrl.searchParams.get("url") || "";
      const forceDownload = reqUrl.searchParams.get("download") === "1";
      if (!mediaUrl) {
        sendJson(res, 400, { success: false, message: "Missing or expired media token." });
        return;
      }
      await proxyMedia(req, res, mediaUrl, forceDownload);
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  if (req.url !== "/api/v2/remove-watermark" || req.method !== "POST") {
    sendJson(res, 404, { success: false, message: "Not Found" });
    return;
  }

  try {
    const raw = await readRequestBody(req);
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { success: false, message: "Request body must be JSON." });
      return;
    }

    const videoUrl = String(body.url || "").trim();
    if (!videoUrl) {
      sendJson(res, 400, { success: false, message: "Field 'url' is required." });
      return;
    }

    const result = await callUpstream(videoUrl);
    if (result.success && result.data?.noWatermarkUrl) {
      const mediaToken = issueMediaToken(result.data.noWatermarkUrl);
      result.data.playPath = `/api/v2/media/${mediaToken}`;
      result.data.downloadPath = `/api/v2/media/${mediaToken}?download=1`;
    }
    sendJson(res, result.success ? 200 : 502, result);
  } catch (error) {
    console.error("v2 server error:", error);
    sendJson(res, 500, { success: false, message: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`v2 web+api running at http://127.0.0.1:${PORT}/v2.html`);
});

setInterval(cleanupExpiredMediaTokens, 5 * 60 * 1000).unref();
