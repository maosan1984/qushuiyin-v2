const DEFAULT_API_URL = "https://api.wxshares.com/api/qsy/plus";

function addCors(headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Range");
  return headers;
}

function jsonResponse(payload, status = 200) {
  const headers = addCors(new Headers());
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function encodeMediaToken(url) {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeMediaToken(token) {
  const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + padding);
}

function buildMediaPaths(requestUrl, mediaUrl) {
  const requestOrigin = new URL(requestUrl).origin;
  const token = encodeMediaToken(mediaUrl);
  return {
    playPath: `${requestOrigin}/api/v2/media/${token}`,
    downloadPath: `${requestOrigin}/api/v2/media/${token}?download=1`,
  };
}

async function callUpstream(videoUrl, env) {
  const apiKey = env.API_KEY || "";
  const apiUrl = env.API_URL || DEFAULT_API_URL;

  if (!apiKey) {
    return {
      success: false,
      message: "API_KEY is not configured on the server.",
    };
  }

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: videoUrl,
      key: apiKey,
    }),
  });

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return {
      success: false,
      message: "Upstream returned non-JSON content.",
    };
  }

  if (!upstream.ok || payload?.code !== 200) {
    return {
      success: false,
      message: `Upstream parse failed (code ${payload?.code ?? "unknown"}).`,
    };
  }

  const mediaUrl = payload?.data?.play || payload?.data?.url;
  if (!mediaUrl) {
    return {
      success: false,
      message: "Upstream response missing output URL.",
    };
  }

  return {
    success: true,
    data: {
      originalUrl: videoUrl,
      noWatermarkUrl: mediaUrl,
      platform: payload?.data?.platform || "Unknown",
      title: payload?.data?.title || "Untitled",
    },
  };
}

async function proxyMedia(request, mediaUrl, forceDownload) {
  let parsed;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return jsonResponse({ success: false, message: "Invalid media url." }, 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return jsonResponse({ success: false, message: "Unsupported media protocol." }, 400);
  }

  const upstreamHeaders = new Headers({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
  });

  const range = request.headers.get("Range");
  if (range) {
    upstreamHeaders.set("Range", range);
  }

  let upstream;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch {
    return jsonResponse({ success: false, message: "Media fetch failed." }, 502);
  }

  const responseHeaders = addCors(new Headers());
  const headerNames = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
  ];

  for (const name of headerNames) {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/octet-stream");
  }

  if (forceDownload) {
    responseHeaders.set("Content-Disposition", 'attachment; filename="video.mp4"');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function serveAsset(request, env, pathnameOverride = "") {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Static assets binding is missing.", { status: 500 });
  }

  const assetUrl = new URL(request.url);
  if (pathnameOverride) {
    assetUrl.pathname = pathnameOverride;
  }

  return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: addCors(new Headers()),
      });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/v2.html")) {
      return serveAsset(request, env, "/v2.html");
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/v2/media/")) {
      const token = url.pathname.split("/").filter(Boolean).pop() || "";
      if (!token) {
        return jsonResponse({ success: false, message: "Missing media token." }, 400);
      }

      let mediaUrl = "";
      try {
        mediaUrl = decodeMediaToken(token);
      } catch {
        return jsonResponse({ success: false, message: "Invalid media token." }, 400);
      }

      const forceDownload = url.searchParams.get("download") === "1";
      return proxyMedia(request, mediaUrl, forceDownload);
    }

    if (request.method === "POST" && url.pathname === "/api/v2/remove-watermark") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ success: false, message: "Request body must be JSON." }, 400);
      }

      const videoUrl = String(body.url || "").trim();
      if (!videoUrl) {
        return jsonResponse({ success: false, message: "Field 'url' is required." }, 400);
      }

      try {
        const result = await callUpstream(videoUrl, env);
        if (result.success && result.data?.noWatermarkUrl) {
          const mediaPaths = buildMediaPaths(request.url, result.data.noWatermarkUrl);
          result.data.playPath = mediaPaths.playPath;
          result.data.downloadPath = mediaPaths.downloadPath;
        }
        return jsonResponse(result, result.success ? 200 : 502);
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message: error?.message || "Internal server error.",
          },
          500
        );
      }
    }

    if (request.method === "GET") {
      return serveAsset(request, env);
    }

    return jsonResponse({ success: false, message: "Not Found" }, 404);
  },
};
