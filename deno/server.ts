const API_URL = Deno.env.get("API_URL") || "https://api.wxshares.com/api/qsy/plus";
const API_KEY = Deno.env.get("API_KEY") || "";

const textEncoder = new TextEncoder();

const ASSET_FILES = {
  "/": { file: "../public/v2.html", type: "text/html; charset=utf-8" },
  "/v2.html": { file: "../public/v2.html", type: "text/html; charset=utf-8" },
  "/v2.js": { file: "../public/v2.js", type: "application/javascript; charset=utf-8" },
  "/v2-url.js": { file: "../public/v2-url.js", type: "application/javascript; charset=utf-8" },
  "/favicon.svg": { file: "../public/favicon.svg", type: "image/svg+xml" },
  "/icons.svg": { file: "../public/icons.svg", type: "image/svg+xml" },
} as const;

type AssetPath = keyof typeof ASSET_FILES;

const assetCache = new Map<string, Uint8Array>();

function withCors(headers = new Headers()) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Range");
  return headers;
}

function jsonResponse(payload: unknown, status = 200) {
  const headers = withCors();
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function getAssetPathname(pathname: string): AssetPath | "" {
  if (pathname in ASSET_FILES) {
    return pathname as AssetPath;
  }
  return "";
}

async function readAsset(pathname: AssetPath) {
  const cached = assetCache.get(pathname);
  if (cached) {
    return cached;
  }

  const assetUrl = new URL(ASSET_FILES[pathname].file, import.meta.url);
  const asset = await Deno.readFile(assetUrl);
  assetCache.set(pathname, asset);
  return asset;
}

async function serveAsset(pathname: AssetPath) {
  try {
    const body = await readAsset(pathname);
    const headers = withCors();
    headers.set("Content-Type", ASSET_FILES[pathname].type);
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

function encodeMediaToken(url: string) {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeMediaToken(token: string) {
  const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(normalized + padding);
}

function buildMediaPaths(requestUrl: string, mediaUrl: string) {
  const origin = new URL(requestUrl).origin;
  const token = encodeMediaToken(mediaUrl);
  return {
    playPath: `${origin}/api/v2/media/${token}`,
    downloadPath: `${origin}/api/v2/media/${token}?download=1`,
  };
}

async function callUpstream(videoUrl: string) {
  if (!API_KEY) {
    return {
      success: false,
      message: "API_KEY is not configured on the server.",
    };
  }

  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: videoUrl,
      key: API_KEY,
    }),
  });

  let payload: any = null;
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

async function proxyMedia(request: Request, mediaUrl: string, forceDownload: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return jsonResponse({ success: false, message: "Invalid media url." }, 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return jsonResponse({ success: false, message: "Unsupported media protocol." }, 400);
  }

  const headers = new Headers({
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Referer: "https://www.douyin.com/",
    Origin: "https://www.douyin.com",
  });

  const range = request.headers.get("Range");
  if (range) {
    headers.set("Range", range);
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers,
      redirect: "follow",
    });
  } catch {
    return jsonResponse({ success: false, message: "Media fetch failed." }, 502);
  }

  const responseHeaders = withCors();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("Content-Type", "application/octet-stream");
  }

  if (forceDownload) {
    responseHeaders.set("Content-Disposition", 'attachment; filename="video.mp4"');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function handleRemoveWatermark(request: Request) {
  let body: { url?: string } = {};
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
    const result = await callUpstream(videoUrl);
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
        message: error instanceof Error ? error.message : "Internal server error.",
      },
      500,
    );
  }
}

function healthResponse() {
  return jsonResponse(
    {
      success: true,
      runtime: "deno-deploy",
      hasApiKey: Boolean(API_KEY),
    },
    200,
  );
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCors(),
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v2/health") {
    return healthResponse();
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/v2/media/")) {
    const token = url.pathname.split("/").filter(Boolean).pop() || "";
    if (!token) {
      return jsonResponse({ success: false, message: "Missing media token." }, 400);
    }

    try {
      const mediaUrl = decodeMediaToken(token);
      const forceDownload = url.searchParams.get("download") === "1";
      return await proxyMedia(request, mediaUrl, forceDownload);
    } catch {
      return jsonResponse({ success: false, message: "Invalid media token." }, 400);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/v2/remove-watermark") {
    return handleRemoveWatermark(request);
  }

  if (request.method === "GET") {
    const assetPath = getAssetPathname(url.pathname);
    if (assetPath) {
      return serveAsset(assetPath);
    }
  }

  return new Response(textEncoder.encode("Not Found"), { status: 404 });
});
